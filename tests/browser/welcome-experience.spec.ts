import { expect, test } from "./helpers/test";

test("the welcome hero is sharp on its first rendered frame", async ({ page }) => {
  await page.goto("/");

  const heroElements = page.locator(".welcome-hero-line, .welcome-nav-enter, .welcome-hero-actions > *");
  await expect(heroElements.first()).toBeVisible();
  await expect(heroElements).toHaveCount(8);
  await heroElements.evaluateAll((elements) => {
    for (const element of elements) (element as HTMLElement).style.setProperty("animation", "none", "important");
  });
  await expect(heroElements.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).filter))).resolves.toEqual([
    "none", "none", "none", "none", "none", "none", "none", "none",
  ]);
  await expect(heroElements.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity))).resolves.toEqual([
    "0", "0", "0", "0", "0", "0", "0", "0",
  ]);

  const cue = page.locator(".welcome-scroll-cue");
  await expect(cue).toHaveCSS("animation-delay", "2.15s");
  await cue.evaluate((element) => (element as HTMLElement).style.setProperty("animation", "none", "important"));
  await expect(cue).toHaveCSS("opacity", "0");
  await expect(cue).toHaveCSS("filter", "blur(10px)");

  const heroImage = page.locator(".welcome-hero-image");
  await expect(heroImage).toHaveCSS("animation-duration", "3.6s");
  await heroImage.evaluate((element) => (element as HTMLElement).style.setProperty("animation", "none", "important"));
  await expect(heroImage).toHaveCSS("transform", "matrix(1.08, 0, 0, 1.08, 0, 0)");

  const headingLineHeights = await page.locator(".welcome-hero h1, .welcome-page h2").evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    return Number.parseFloat(styles.lineHeight) / Number.parseFloat(styles.fontSize);
  }));
  expect(headingLineHeights.every((lineHeight) => lineHeight >= 1)).toBe(true);
});

test("the welcome hero completes its entrance when motion is forced", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const heroElements = page.locator(".welcome-hero-line, .welcome-nav-enter, .welcome-hero-actions > *");
  await expect(heroElements.first()).toBeVisible();
  await page.waitForTimeout(2_100);
  await expect(heroElements.evaluateAll((elements) => elements.map((element) => ({
    filter: getComputedStyle(element).filter,
    opacity: getComputedStyle(element).opacity,
    settled: ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(getComputedStyle(element).transform),
  })))).resolves.toEqual(Array.from({ length: 8 }, () => ({ filter: "none", opacity: "1", settled: true })));
});

test("below-the-fold sections never use a blur or opacity entrance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const targets = page.locator("[data-scroll-motion]");
  expect(await targets.count()).toBeGreaterThan(12);
  const styles = await targets.evaluateAll((elements) => elements.map((element) => ({
    filter: getComputedStyle(element).filter,
    opacity: getComputedStyle(element).opacity,
  })));
  expect(styles.every((style) => style.filter === "none" && style.opacity === "1")).toBe(true);
});

test("a section stays unrevealed until it is well inside the viewport", async ({ page }) => {
  await page.goto("/");

  // The hero is short and starts in view; the sections below it must not have fired yet.
  const firstSection = page.locator("[data-scroll-motion]").first();
  await expect(firstSection).not.toHaveClass(/is-visible/);

  // Walk down in viewport-sized steps and record, for the first section, the scroll position at
  // which it finally flips to visible. A high minimum-visible threshold means it cannot fire
  // until a large share of the section is on screen, not the moment its top edge crosses the fold.
  const reveal = await firstSection.evaluate(async (element) => {
    const viewportHeight = window.innerHeight;
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y <= height; y += 40) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
      if (element.classList.contains("is-visible")) {
        const top = element.getBoundingClientRect().top;
        return { scrollY: Math.round(window.scrollY), top: Math.round(top), ratio: (viewportHeight - top) / element.getBoundingClientRect().height };
      }
    }
    return null;
  });

  expect(reveal).not.toBeNull();
  // When it fires, roughly half the section has to be inside the viewport (and its top edge is
  // therefore well below the fold, not just peeking over it).
  expect(reveal!.ratio).toBeGreaterThanOrEqual(0.4);
  expect(reveal!.top).toBeGreaterThan(0);
});

test("every scroll-motion section eventually reveals once the page is scrolled through", async ({ page }) => {
  await page.goto("/");

  const targets = page.locator("[data-scroll-motion]");
  const total = await targets.count();
  expect(total).toBeGreaterThan(12);

  const revealed = await page.evaluate(async () => {
    const elements = [...document.querySelectorAll("[data-scroll-motion]")];
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y <= height; y += 80) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
    }
    return elements.filter((element) => element.classList.contains("is-visible")).length;
  });

  // A ratio the browser can never satisfy would leave sections permanently blank, which is the
  // failure mode a threshold change can introduce.
  expect(revealed).toBe(total);
});
