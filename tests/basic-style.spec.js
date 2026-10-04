import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const pageUrl = pathToFileURL(path.join(process.cwd(), "index.html")).href;
const screenshotDir = path.join(process.cwd(), "screenshots");

test.beforeAll(() => {
  fs.mkdirSync(screenshotDir, { recursive: true });
});

test("page renders without broken assets or horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(pageUrl);

  await expect(page.locator(".paper-title")).toBeVisible();
  await expect(page.locator(".tldr-box")).toBeVisible();
  await expect(page.locator(".author-line a.author-link")).toHaveCount(6);
  await expect(page.locator(".institution-logo")).toHaveCount(2);
  await expect(page.locator("#tldr .gaze-viewer canvas")).toHaveCount(2);
  for (const canvas of await page.locator("#tldr .gaze-viewer canvas").all()) {
    await expect(canvas).toBeVisible();
  }
  await expect(page.locator("#image-chart svg")).toBeVisible();
  await expect(page.locator("#citation .citation-box")).toBeVisible();

  // Open every tab and accordion so that lazily loaded images are requested.
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    const panel = page.locator(`#${await tab.getAttribute("aria-controls")}`);
    await expect(panel).toBeVisible();
    for (const button of await panel.locator("[data-example-target]").all()) {
      await button.click();
      for (const image of await panel.locator("img:visible").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty("complete", true);
      }
    }
    for (const image of await panel.locator("img:visible").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("complete", true);
    }
  }
  for (const question of await page.locator(".research-question").all()) {
    const content = question.locator(".question-content");
    if (!(await content.isVisible())) {
      await question.locator(".question-toggle").click();
    }
    await expect(content).toBeVisible();
  }

  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src")),
  );
  expect(brokenImages).toEqual([]);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(errors).toEqual([]);

  await page.screenshot({
    path: path.join(screenshotDir, `${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("gaze viewer shows dense and gaze attention for the selected word", async ({
  page,
}) => {
  await page.goto(pageUrl);

  const viewer = page.locator("#tldr .gaze-viewer");
  const panes = viewer.locator(".gv-pane");
  const dense = viewer.locator(".gv-pane.is-dense");
  const gaze = viewer.locator(".gv-pane.is-gaze");

  await expect(viewer.locator(".gv-thumb")).toHaveCount(6);
  await expect(panes).toHaveCount(2);
  await expect(panes.locator(".gv-pane-title")).toHaveText([
    "Dense attention",
    "Gaze Attention",
  ]);
  const thumbsBox = await viewer.locator(".gv-thumbs").boundingBox();
  const denseBox = await dense.boundingBox();
  const gazeBox = await gaze.boundingBox();
  expect(thumbsBox.y + thumbsBox.height).toBeLessThanOrEqual(denseBox.y);
  expect(denseBox.y + denseBox.height).toBeLessThanOrEqual(gazeBox.y);

  await viewer.getByRole("button", { name: /^Example 2:/ }).click();
  await gaze.locator(".gv-token", { hasText: "bicycle" }).click();
  for (const pane of [dense, gaze]) {
    await expect(pane.locator(".gv-token.is-current")).toHaveText("bicycle");
    await expect(pane.locator(".gv-status")).toContainText("bicycle");
  }
  await expect(dense.locator(".gv-status")).toContainText(
    "all 1,024 visual tokens",
  );
  await expect(gaze.locator(".gv-status")).toContainText(
    "128 of 1,024 visual tokens",
  );

  await dense.locator(".gv-token", { hasText: "dog" }).click();
  await expect(gaze.locator(".gv-token.is-current")).toHaveText("dog");
});

test("result pills open their accordion", async ({ page }) => {
  await page.goto(pageUrl);

  const pill = page.locator('.custom-nav-pills a[href="#video-qa"]');
  const content = page.locator("#video-qa .question-content");

  await expect(content).toBeHidden();
  await pill.click();
  await expect(content).toBeVisible();
  await expect(pill).toHaveClass(/active/);

  const chart = page.locator("#video-chart");
  await expect(chart.locator("svg")).toBeVisible();
  const points = chart.locator(".hit");
  await expect(points).toHaveCount(5);
  const labels = await points.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label")),
  );
  expect(labels.every((label) => label.includes("Cambrian-4B"))).toBe(true);
  expect(labels.some((label) => label.startsWith("−1.7 points"))).toBe(true);
  const lowBudget = chart.locator('.hit[aria-label*="2000 of 20000"]');
  await expect(lowBudget).toHaveAttribute("aria-label", /^\+1\.1 points/);
  await lowBudget.focus();
  await expect(page.locator(".chart-tooltip")).toContainText(
    "2000 of 20000 visual KV entries (10%)",
  );
});

test("image examples switch together and survive a video tab visit", async ({
  page,
}) => {
  await page.goto(pageUrl);
  const panel = page.locator("#panel-eviction");
  const examples = [
    ["What is the dog holding", "flowers", "dog-cat/photo.jpg"],
    ["Where are the people", "They", "people-dog/photo.jpg"],
    ["Where are the man", "holding", "man-dog-sheep/photo.jpg"],
    ["What is the dog doing", "railing", "dog-bicycle/photo.jpg"],
  ];

  for (const [index, [question, word, photo]] of examples.entries()) {
    const button = panel.locator("[data-example-target]").nth(index);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator('[aria-pressed="true"]')).toHaveCount(1);
    const example = panel.locator("[data-image-example]:visible");
    await expect(example).toHaveCount(1);
    await expect(example.locator(".qa-question")).toContainText(question);
    await expect(example.locator(".selection-ours > p")).toContainText(word);
    await expect(example.locator(".is-photo img")).toHaveAttribute(
      "src",
      new RegExp(photo.replaceAll(".", "\\.") + "$"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }

  await page.getByRole("tab", { name: "Videos", exact: true }).click();
  await page
    .getByRole("tab", {
      name: "Images (Ours vs. Eviction methods)",
      exact: true,
    })
    .click();
  await expect(panel.locator("#image-example-4")).toBeVisible();
  await panel.locator("[data-example-target]").first().focus();
  await page.keyboard.press("Enter");
  await expect(panel.locator("#image-example-1")).toBeVisible();
});
