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
  await page.goto("/");

  const targets = page.locator("[data-scroll-motion]");
  expect(await targets.count()).toBeGreaterThan(12);
  const styles = await targets.evaluateAll((elements) => elements.map((element) => ({
    filter: getComputedStyle(element).filter,
    opacity: getComputedStyle(element).opacity,
  })));
  expect(styles.every((style) => style.filter === "none" && style.opacity === "1")).toBe(true);
});
