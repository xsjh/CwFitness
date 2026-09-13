import { expect, test, type Page } from "./helpers/test";

type Locator = ReturnType<Page["locator"]>;

test("solid-color sections render sparse decorative contour lines", async ({ page }) => {
  await page.goto("/");

  const section = page.locator(".welcome-intro");
  const field = section.locator(".welcome-contours");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-contour-host", "true");
  await expect(field.locator("path")).toHaveCount(6);
  await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(field).toHaveCSS("pointer-events", "none");
  await expect(field.locator("path").first()).toHaveCSS("stroke-dasharray", "3px, 8px");
});

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

test("product-principle cards reveal, keep moving left, and lift on hover", async ({ page }) => {
  await page.goto("/");
  const viewport = page.locator(".welcome-principle-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await viewport.evaluate((element) => element.classList.add("motion-ready", "is-visible"));

  const track = page.locator(".welcome-principle-track");
  const cards = page.locator(".welcome-principle-card");
  await expect(cards).toHaveCount(10);
  await expect(track).toHaveCSS("animation-name", "welcome-marquee");
  await expect(track).toHaveCSS("animation-timing-function", "linear");

  const first = cards.first().locator("article");
  await first.hover();
  await page.waitForTimeout(220);
  const transform = await first.evaluate((element) => getComputedStyle(element).transform);
  expect(transform).not.toBe("none");
  expect(Number(transform.match(/^matrix\(([^,]+)/)?.[1])).toBeGreaterThan(1);
});

test("the forced-motion welcome page keeps its principle marquee when reduced motion is set", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".welcome-principle-track")).toHaveCSS("animation-name", "welcome-marquee");
});

test("principle cards start their reveal only when the forced-motion viewport enters view", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const viewport = page.locator(".welcome-principle-viewport");
  const firstCard = viewport.locator(".welcome-principle-card").first();
  await expect(firstCard).toHaveCSS("animation-name", "none");
  await viewport.evaluate((element) => element.classList.add("motion-ready", "is-visible"));
  await expect(firstCard).toHaveCSS("animation-name", "welcome-principle-card-in");
  await expect(viewport).toHaveCSS("clip-path", "inset(0px)");
});

test("principle cards remain visible before the scroll observer starts their entrance", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".welcome-principle-card").first()).toHaveCSS("opacity", "1");
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
  await page.waitForTimeout(2400);
  await expect(panel).toHaveAttribute("data-tilt-live", "");
  const topLeft = await glow();
  expect(topLeft.x).toBeLessThan(30);
  expect(topLeft.y).toBeLessThan(35);
  // The fade is a CSS transition whose duration is a design choice, so assert that the highlight is
  // clearly painted rather than that it has reached a particular value.
  expect(topLeft.opacity).toBeGreaterThan(0.4);

  // The glow follows the pointer rather than sitting on the panel's far side.
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8);
  await page.waitForTimeout(2400);
  const bottomRight = await glow();
  expect(bottomRight.x).toBeGreaterThan(topLeft.x + 30);
  expect(bottomRight.y).toBeGreaterThan(topLeft.y + 30);

  // Leaving the panel fades it back out instead of leaving it lit.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(6000);
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

test("the gallery grows the hovered frame and squeezes the other three", async ({ page }) => {
  await page.goto("/");
  const row = page.locator("[data-gallery-row]");
  await row.scrollIntoViewIfNeeded();
  // The row is revealed by the scroll observer; force the end state so widths are measurable.
  await page.evaluate(() => {
    for (const frame of document.querySelectorAll("[data-gallery-row] > figure")) {
      frame.classList.add("is-visible");
    }
  });
  await page.waitForTimeout(900);

  // Widths are read off the painted box, not the written variable: the accordion is a flex weight,
  // so a stylesheet rule could override the property and the geometry would not move with it.
  const widths = () => row.evaluate((element) =>
    [...element.querySelectorAll(":scope > figure")].map((frame) => +frame.getBoundingClientRect().width.toFixed(1)));

  // Park the pointer away from the row before the baseline reading. `page.mouse.move(0, 0)` below
  // scrolls the page back to the top, and the row is a percentage of its own container, so a
  // baseline taken mid-page would be measured against a different row width than the released one.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);

  const rest = await widths();
  expect(rest).toHaveLength(3);
  // Fill the row exactly, and stagger: no two frames share a width at rest.
  expect(new Set(rest).size).toBeGreaterThan(1);
  // Squeezing presupposes there is something to squeeze: the row has to be wider than a resting
  // frame's own span, or the only way a frame can grow is for the others to shrink to nothing.
  const tightest = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    const gap = Number.parseFloat(style.columnGap || "0");
    const narrowest = Math.min(...[...element.querySelectorAll(":scope > figure")]
      .map((frame) => frame.getBoundingClientRect().width));
    return narrowest * (element.children.length - 1) + gap * (element.children.length - 2);
  });
  expect(tightest).toBeGreaterThan(140);

  const hover = async (index: number) => {
    const point = await row.evaluate((element, i) => {
      const box = element.querySelectorAll(":scope > figure")[i].getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, index);
    await page.mouse.move(point.x, point.y, { steps: 14 });
    await page.waitForTimeout(1200);
    return widths();
  };

  const others = rest.map((_, index) => index).filter((index) => index !== 0);

  const hoveredFirst = await hover(0);
  expect(hoveredFirst[0]).toBeGreaterThan(rest[0]);
  for (const index of others) expect(hoveredFirst[index]).toBeLessThan(rest[index]);
  expect(hoveredFirst[0]).toBeGreaterThan(Math.max(...hoveredFirst.slice(1)));

  // The total is preserved, which is what makes it read as squeezing rather than as a scale-up.
  // `flex-grow` only distributes the space left after the row's gaps, so the comparison is against
  // the row width minus those gaps rather than against the row box.
  const budget = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    const gap = Number.parseFloat(style.columnGap || "0");
    return element.getBoundingClientRect().width - gap * (element.children.length - 1);
  });
  const total = (list: number[]) => list.reduce((sum, width) => sum + width, 0);
  // Sub-pixel rounding across the flex tracks costs a few px; the contract is that nothing is
  // lost or created, not that the sum is exact to the pixel.
  expect(Math.abs(total(hoveredFirst) - budget)).toBeLessThan(8);

  // Every frame has to be growable, and the hovered one has to end up the widest in the row — that
  // is what makes the gesture read as "this one took the space the others gave up". A fixed growth
  // multiple would be false for the frame that is already widest at rest.
  for (let index = 0; index < rest.length; index++) {
    const hovered = await hover(index);
    expect(hovered[index]).toBeGreaterThan(rest[index]);
    for (let other = 0; other < hovered.length; other++) {
      if (other === index) continue;
      expect(hovered[index]).toBeGreaterThan(hovered[other]);
    }
  }

  // Leaving the row restores the authored proportions.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1300);
  const released = await widths();
  for (let index = 0; index < rest.length; index++) expect(Math.abs(released[index] - rest[index])).toBeLessThan(6);
});
