/* Accordions, their nav pills and the tabs. Without JavaScript all content stays visible. */
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- result accordions ---------- */
  const questions = new Map();
  const navLinks = Array.from(
    document.querySelectorAll(".custom-nav-pills .nav-link"),
  );
  let defaultQuestionId = "";

  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.hash === `#${id}`);
    });
  };

  document.querySelectorAll(".research-question").forEach((question) => {
    const header = question.querySelector(".question-header");
    const toggle = question.querySelector(".question-toggle");
    const content = question.querySelector(".question-content");
    if (!header || !toggle || !content || !question.id) return;

    const close = () => {
      question.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      content.hidden = true;
    };

    const open = () => {
      question.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      content.hidden = false;
    };

    close();
    questions.set(question.id, { open, close });

    if (question.dataset.defaultOpen === "true") {
      open();
      defaultQuestionId ||= question.id;
    }

    header.addEventListener("click", () => {
      const shouldOpen = !question.classList.contains("is-open");
      shouldOpen ? open() : close();

      if (shouldOpen) {
        history.replaceState(null, "", `#${question.id}`);
        setActiveLink(question.id);
      }
    });
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.hash.slice(1);
      const entry = questions.get(id);
      if (!entry) return;
      entry.open();
      setActiveLink(id);
    });
  });

  /* ---------- tabs ---------- */
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

  const selectTab = (tab, focus = false) => {
    tabs
      .filter((other) => other.parentElement === tab.parentElement)
      .forEach((other) => {
        const selected = other === tab;
        const panel = document.getElementById(
          other.getAttribute("aria-controls"),
        );
        other.setAttribute("aria-selected", String(selected));
        other.tabIndex = selected ? 0 : -1;
        if (panel) panel.hidden = !selected;
      });
    if (focus) tab.focus();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const group = tabs.filter(
        (other) => other.parentElement === tab.parentElement,
      );
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next =
        group[(group.indexOf(tab) + step + group.length) % group.length];
      selectTab(next, true);
    });
  });

  tabs
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .forEach((tab) => selectTab(tab));

  document.querySelectorAll("[data-open-tab]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const tab = document.getElementById(link.dataset.openTab);
      if (!tab) return;
      event.preventDefault();
      selectTab(tab);
      tab.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ---------- image comparison examples ---------- */
  const exampleButtons = Array.from(
    document.querySelectorAll("[data-example-target]"),
  );
  const imageExamples = Array.from(
    document.querySelectorAll("[data-image-example]"),
  );

  exampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.exampleTarget;
      imageExamples.forEach((example) => {
        example.hidden = example.id !== target;
      });
      exampleButtons.forEach((other) => {
        other.setAttribute("aria-pressed", String(other === button));
      });
    });
  });

  /* ---------- deep links ---------- */
  const activateByHash = () => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const entry = questions.get(id);
    if (entry) {
      entry.open();
      setActiveLink(id);
      return;
    }
    const tab = tabs.find(
      (other) => other.getAttribute("aria-controls") === id,
    );
    if (tab) selectTab(tab);
  };

  activateByHash();
  if (!questions.has(window.location.hash.slice(1)) && defaultQuestionId) {
    setActiveLink(defaultQuestionId);
  }
  window.addEventListener("hashchange", activateByHash, false);
});
