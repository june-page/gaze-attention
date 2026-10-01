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
  await expect(page.locator("#tldr .gaze-viewer canvas")).toBeVisible();
  await expect(page.locator("#image-chart svg")).toBeVisible();
  await expect(page.locator("#citation .citation-box")).toBeVisible();

  // Open every tab and accordion so that lazily loaded images are requested.
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    const panel = page.locator(`#${await tab.getAttribute("aria-controls")}`);
    await expect(panel).toBeVisible();
    for (const image of await panel.locator("img").all()) {
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

test("gaze viewer follows the selected example, word and view", async ({
  page,
}) => {
  await page.goto(pageUrl);

  const viewer = page.locator("#tldr .gaze-viewer");
  const status = viewer.locator(".gv-status");
  const current = viewer.locator(".gv-token.is-current");

  await expect(viewer.locator(".gv-thumb")).toHaveCount(6);
  await viewer.getByRole("button", { name: /^Example 2:/ }).click();
  await viewer.locator(".gv-token", { hasText: "bicycle" }).click();
  await expect(current).toHaveText("bicycle");
  await expect(status).toContainText("bicycle");
  await expect(status).toContainText("128 of 1,024 visual tokens");

  await viewer
    .getByRole("button", { name: "Dense attention", exact: true })
    .click();
  await expect(status).toContainText("all 1,024 visual tokens");
  await expect(current).toHaveText("bicycle");

  await viewer
    .getByRole("button", { name: "Gaze Attention", exact: true })
    .click();
  await expect(status).toContainText("128 of 1,024 visual tokens");
  await expect(current).toHaveText("bicycle");
});

test("result pills open their accordion", async ({ page }) => {
  await page.goto(pageUrl);

  const pill = page.locator('.custom-nav-pills a[href="#video-qa"]');
  const content = page.locator("#video-qa .question-content");

  await expect(content).toBeHidden();
  await pill.click();
  await expect(content).toBeVisible();
  await expect(pill).toHaveClass(/active/);
});
