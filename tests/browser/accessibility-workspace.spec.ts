import { expect, test, type Page } from "@playwright/test";
import { clipped, measuredBoxes, overlapping } from "./helpers/layout";
import {
  acceptDialogs,
  openView,
  prepareWorkout,
  signUp,
  startWorkout,
  uniqueEmail,
} from "./helpers/workspace";

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

/**
 * Blink does not implement `prefers-reduced-transparency` and Playwright cannot emulate it
 * on any engine, so the degradation cannot be switched on at runtime. What is checkable is
 * that it is *complete*: every surface that actually renders a backdrop filter must fall
 * under a `prefers-reduced-transparency` rule that replaces it.
 */
async function transparencyCoverage(page: Page) {
  return page.evaluate(() => {
    const selectors: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSMediaRule) || !rule.media.mediaText.includes("prefers-reduced-transparency")) continue;
        for (const inner of Array.from(rule.cssRules)) {
          if (inner instanceof CSSStyleRule) selectors.push(inner.selectorText);
        }
      }
    }

    const translucent = Array.from(document.querySelectorAll<HTMLElement>(".workspace-shell, .workspace-shell *"))
      .filter((element) => element.getBoundingClientRect().width > 0)
      .filter((element) => {
        const filter = getComputedStyle(element).getPropertyValue("backdrop-filter").trim();
        return filter !== "" && filter !== "none";
      });

    const label = (element: Element) => `${element.tagName.toLowerCase()}[${String(element.className)}]`;
    return {
      selectors,
      translucent: translucent.map(label),
      uncovered: translucent
        .filter((element) => !selectors.some((selector) => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        }))
        .map(label),
    };
  });
}

test.beforeEach(async ({ page }) => {
  acceptDialogs(page);
});

test("reduced transparency is declared for every translucent surface", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("transparency") });
  const report = await transparencyCoverage(page);

  expect(report.selectors.length).toBeGreaterThan(0);
  expect(report.translucent.length).toBeGreaterThan(0);
  expect(report.uncovered, "these surfaces stay translucent under prefers-reduced-transparency").toEqual([]);

  await openView(page, "动作");
  await expect(transparencyCoverage(page)).resolves.toMatchObject({ uncovered: [] });
});

test("increased contrast strengthens boundaries on the authenticated workspace", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("contrast") });
  const shell = page.locator(".workspace-shell");
  await expect(shell).toHaveCSS("color", "rgba(255, 255, 255, 0.96)");

  await page.emulateMedia({ contrast: "more" });

  await expect(shell).toHaveCSS("color", "rgb(255, 255, 255)");
  const currentNav = page.locator(".workspace-nav button[aria-current='page']");
  await expect(currentNav).toHaveCSS("outline-width", "2px");
  await expect(currentNav).toHaveCSS("outline-color", "rgb(255, 255, 255)");
});

test("reduced motion removes displacement from the authenticated workspace", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, { email: uniqueEmail("motion") });

  const section = page.locator(".workspace-section").first();
  await expect(section).toBeVisible();
  const animationSeconds = await section.evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(animationSeconds).toBeLessThanOrEqual(0.001);
  const transitionSeconds = await page.locator(".action-button").first().evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transitionSeconds).toBe("0s");
});

test("primary views are reachable with the keyboard alone", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("keyboard") });

  // Tab forward until a navigation control owns focus, proving the order is reachable
  // without a pointer and that every stop shows a focus ring.
  let reachedNav = false;
  for (let step = 0; step < 30 && !reachedNav; step += 1) {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    reachedNav = await page.evaluate(() => document.activeElement?.textContent?.trim() === "动作");
  }
  expect(reachedNav).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "定义你在训练中记录的动作。" })).toBeVisible();
  await expect(page.locator(".workspace-nav button[aria-current='page']")).toHaveText("动作");
});

for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`every core view fits the ${viewport.name} viewport without overlap`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signUp(page, { email: uniqueEmail(`layout-${viewport.name}`) });
    await prepareWorkout(page, { exercise, plan, day });

    // The floating navigation is deliberately a scrollable strip on small screens, so it
    // is measured as a whole rather than control by control.
    const navBox = await page.locator(".workspace-nav").boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x).toBeGreaterThanOrEqual(0);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(viewport.width + 0.5);

    for (const view of ["今日", "计划", "动作", "进展", "设置"] as const) {
      await openView(page, view);
      const boxes = await measuredBoxes(page, ".workspace-body");
      expect(boxes.length).toBeGreaterThan(0);
      expect(clipped(boxes, viewport.width), `${view} controls outside the ${viewport.name} viewport`).toEqual([]);
      expect(overlapping(boxes), `${view} controls overlap at ${viewport.name}`).toEqual([]);

      const hoverOnly = await page
        .locator(".workspace-body button, .workspace-body summary")
        .evaluateAll((elements) => elements
          .filter((element) => !element.closest("details:not([open])"))
          .filter((element) => {
            const style = getComputedStyle(element);
            return style.pointerEvents === "none" || Number.parseFloat(style.opacity) === 0 || style.visibility === "hidden";
          })
          .map((element) => (element.textContent ?? "").trim().slice(0, 24)));
      expect(hoverOnly, `${view} has controls that only appear on hover`).toEqual([]);
    }

    await openView(page, "计划");
    await startWorkout(page);
    const trainingBoxes = await measuredBoxes(page, ".workspace-body");
    expect(clipped(trainingBoxes, viewport.width)).toEqual([]);
    expect(overlapping(trainingBoxes)).toEqual([]);
  });
}
