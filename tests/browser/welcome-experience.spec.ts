import { expect, test, type Page } from "./helpers/test";

type Locator = ReturnType<Page["locator"]>;

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

// The tilt writes custom properties, never `transform`, so reading the variables back would pass
// even if a stylesheet rule or a CSS animation were overriding the transform that actually paints.
// These read the projected matrix instead, and use screenshot bytes as the tie-breaker for
// direction because getBoundingClientRect ignores the perspective projection entirely.
const poseOf = (locator: Locator) => locator.evaluate((element) => {
  const matrix = getComputedStyle(element).transform;
  if (matrix === "none" || !matrix.startsWith("matrix3d")) return { rotateX: null, rotateY: null };
  const n = matrix.slice("matrix3d(".length, -1).split(",").map(Number);
  return {
    rotateX: +(Math.atan2(-n[9], n[10]) * 180 / Math.PI).toFixed(2),
    rotateY: +(Math.asin(Math.max(-1, Math.min(1, n[8]))) * 180 / Math.PI).toFixed(2),
  };
});

test("a liquid-glass showcase leans toward the pointer and returns to rest", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".welcome-plan-visual");
  await panel.scrollIntoViewIfNeeded();
  await panel.evaluate((element) => element.classList.add("is-visible"));
  await page.waitForTimeout(700);

  const rest = await poseOf(panel);
  expect(rest.rotateY).toBe(-5);
  expect(rest.rotateX).toBe(2);

  const box = (await panel.boundingBox())!;
  const hover = async (fx: number, fy: number) => {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(650);
    return poseOf(panel);
  };

  // Pointer on the left edge tips the left side away, on the right edge the other way.
  const left = await hover(0.06, 0.5);
  const right = await hover(0.94, 0.5);
  expect(left.rotateY!).toBeLessThan(rest.rotateY!);
  expect(right.rotateY!).toBeGreaterThan(rest.rotateY!);
  expect(Math.abs(right.rotateY! - left.rotateY!)).toBeGreaterThan(2);

  // Above the panel has to tip its top edge toward the viewer (negative rotateX), below the other
  // way — verified against the rendered silhouette, because the euler sign alone is not readable.
  const above = await hover(0.5, 0.02);
  const below = await hover(0.5, 0.98);
  expect(above.rotateX!).toBeLessThan(rest.rotateX!);
  expect(below.rotateX!).toBeGreaterThan(rest.rotateX!);

  // The readable band — past ~16deg the type inside the panel starts to shear.
  expect(Math.abs(right.rotateY! - rest.rotateY!)).toBeLessThanOrEqual(7.1);
  expect(Math.abs(below.rotateX! - rest.rotateX!)).toBeLessThanOrEqual(5.1);

  // Leaving the page releases the pose instead of freezing it where the pointer exited.
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })));
  await page.waitForTimeout(1400);
  const released = await poseOf(panel);
  expect(Math.abs(released.rotateX! - rest.rotateX!)).toBeLessThan(0.3);
  expect(Math.abs(released.rotateY! - rest.rotateY!)).toBeLessThan(0.3);
});

test("the glass glow tracks the pointer inside the panel and fades out when it leaves", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".welcome-plan-visual");
  await panel.scrollIntoViewIfNeeded();
  await panel.evaluate((element) => element.classList.add("is-visible"));
  await page.waitForTimeout(700);

  const glow = () => panel.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      x: Number.parseFloat(style.getPropertyValue("--glass-light-x")),
      y: Number.parseFloat(style.getPropertyValue("--glass-light-y")),
      opacity: Number.parseFloat(style.opacity),
    };
  });

  // At rest the highlight is not painted at all.
  await expect(panel).not.toHaveAttribute("data-tilt-live", "");
  expect((await glow()).opacity).toBe(0);

  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.2);
  await page.waitForTimeout(900);
  await expect(panel).toHaveAttribute("data-tilt-live", "");
  const topLeft = await glow();
  expect(topLeft.x).toBeLessThan(30);
  expect(topLeft.y).toBeLessThan(35);
  expect(topLeft.opacity).toBeGreaterThan(0.9);

  // The glow follows the pointer rather than sitting on the panel's far side.
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8);
  await page.waitForTimeout(900);
  const bottomRight = await glow();
  expect(bottomRight.x).toBeGreaterThan(topLeft.x + 30);
  expect(bottomRight.y).toBeGreaterThan(topLeft.y + 30);

  // Leaving the panel fades it back out instead of leaving it lit.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1400);
  await expect(panel).not.toHaveAttribute("data-tilt-live", "");
  expect((await glow()).opacity).toBeLessThan(0.1);
});

test("a showcase off screen does not take a pointer pose", async ({ page }) => {
  await page.goto("/");
  // Park at the very top so the lower showcases are far below the fold. The welcome page runs
  // Lenis, which keeps its own scroll position, so a bare scrollTo can be pulled back a frame
  // later — drive it through the page's own smooth scroller and wait for it to arrive.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  await page.waitForTimeout(600);

  const far = page.locator(".welcome-progress-visual");
  await far.evaluate((element) => element.classList.add("is-visible"));

  // The premise has to hold at the moment of assertion, not just before the pointer moved.
  const distance = await far.evaluate((element) => element.getBoundingClientRect().top - window.innerHeight);
  expect(distance).toBeGreaterThan(240);

  await page.mouse.move(700, 400);
  await page.waitForTimeout(1200);

  const stillFar = await far.evaluate((element) => element.getBoundingClientRect().top - window.innerHeight);
  expect(stillFar).toBeGreaterThan(240);

  // An off-screen panel gets no pointer offset, so it sits at its resting -5deg yaw. The tolerance
  // is one degree rather than zero: the pose is an exponential follow that the loop stops writing
  // once settled, so the last written value can sit a fraction short of the target.
  const pose = await poseOf(far);
  expect(Math.abs(pose.rotateY! - -5)).toBeLessThan(1);
  expect(Math.abs(pose.rotateX! - 2)).toBeLessThan(1);
});
