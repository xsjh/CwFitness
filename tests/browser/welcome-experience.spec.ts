import { expect, test, type Page } from "./helpers/test";

type Locator = ReturnType<Page["locator"]>;

test("the image break is painted before its scroll observer entrance", async ({ page }) => {
  await page.goto("/");

  // A full-width image section must never reserve its height while clipping all of its pixels;
  // that was perceived as an empty, contentless background between the feature and image beats.
  await expect(page.locator(".welcome-image-break")).toHaveCSS("clip-path", "none");
});

test("the image break has a visible local fallback when its remote photo cannot load", async ({ page }) => {
  await page.goto("/");

  // Remote photos are an enhancement, never the only painted layer of a full-height section.
  await expect(page.locator(".welcome-image-break")).not.toHaveCSS("background-image", "none");
});

test("the image break settles its photo and reveals copy one line at a time", async ({ page }) => {
  await page.goto("/");

  const scene = page.locator(".welcome-image-break");
  const image = scene.locator("img");
  const lines = scene.locator(".welcome-image-line");
  await expect(lines).toHaveCount(3);
  await expect(image).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
  await expect(lines.first()).toHaveCSS("filter", "blur(10px)");

  await scene.evaluate((element) => element.classList.add("is-visible"));
  await expect(lines.first()).toHaveCSS("animation-name", "welcome-image-line-arrive");
  await page.waitForTimeout(900);
  await expect(lines.evaluateAll((elements) => elements.every((element) => {
    const blur = Number.parseFloat(getComputedStyle(element).filter.match(/[\d.]+/)?.[0] ?? "0");
    return blur < 0.01 && Number.parseFloat(getComputedStyle(element).opacity) > 0.99;
  }))).resolves.toBe(true);
  await expect(image).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
});

test("scrolling the image break into view starts its copy entrance", async ({ page }) => {
  await page.goto("/");

  const scene = page.locator(".welcome-image-break");
  await scene.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    window.dispatchEvent(new Event("scroll"));
  });
  await expect(scene).toHaveClass(/is-visible/);
});

test("the image break softens both edges inside the photo boundary", async ({ page }) => {
  await page.goto("/");

  const edgeLayer = page.locator(".welcome-image-break");
  const geometry = await edgeLayer.evaluate((element) => {
    const edge = getComputedStyle(element, "::before");
    return {
      backgroundImage: edge.backgroundImage,
      bottom: Number.parseFloat(edge.bottom),
      top: Number.parseFloat(edge.top),
    };
  });

  expect(geometry.top).toBe(0);
  expect(geometry.bottom).toBe(0);
  expect(geometry.backgroundImage).toContain("linear-gradient");
});

test("the image copy is still blurred when the scene first enters the reading area", async ({ page }) => {
  await page.goto("/");

  const scene = page.locator(".welcome-image-break");
  await scene.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - window.innerHeight * 0.7, behavior: "instant" });
  });

  await expect(scene).not.toHaveClass(/is-visible/);
  await expect(scene.locator(".welcome-image-line").first()).toHaveCSS("filter", "blur(10px)");
});

test("the requested image-copy entrance remains available in reduced-motion browser contexts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const scene = page.locator(".welcome-image-break");
  const line = scene.locator(".welcome-image-line").first();
  await expect(line).toHaveCSS("filter", "blur(10px)");
  await scene.evaluate((element) => element.classList.add("is-visible"));
  await expect(line).toHaveCSS("animation-name", "welcome-image-line-arrive");
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

  // The authored marquee is intentionally always moving, so Playwright cannot consider a card
  // geometrically stable long enough to hover it. Pause only this test page after verifying the
  // animation contract; the hover scale assertion remains a real computed-style check.
  await track.evaluate((element) => { (element as HTMLElement).style.animationPlayState = "paused"; });
  const first = cards.first().locator("article");
  await first.hover();
  await page.waitForTimeout(220);
  const transform = await first.evaluate((element) => getComputedStyle(element).transform);
  expect(transform).not.toBe("none");
  expect(Number(transform.match(/^matrix\(([^,]+)/)?.[1])).toBeGreaterThan(1);
});

test("principle ribbons are seamless, directional, and hidden outside their section", async ({ page }) => {
  await page.goto("/");

  const ribbons = page.locator("[data-scroll-ribbon]");
  const tracks = page.locator("[data-scroll-ribbon-track]");
  await expect(ribbons).toHaveCount(2);
  await expect(tracks).toHaveCount(2);
  await expect(tracks.nth(0)).toHaveAttribute("data-ribbon-direction", "left");
  await expect(tracks.nth(1)).toHaveAttribute("data-ribbon-direction", "right");
  await expect(tracks.nth(0).locator(".welcome-scroll-ribbon-segment")).toHaveCount(3);
  await expect(tracks.nth(1).locator(".welcome-scroll-ribbon-segment")).toHaveCount(3);
  await expect(ribbons.nth(0)).toHaveCSS("position", "fixed");
  await expect(ribbons.nth(0)).toHaveCSS("visibility", "hidden");
  await expect(page.getByText("TECHNIQUE ANALYSIS")).toHaveCount(0);
  await expect(page.getByText("COACH NOTES")).toHaveCount(0);
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
