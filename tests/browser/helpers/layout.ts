import type { Page } from "@playwright/test";

// Geometry checks shared by the accessibility specs. Both the auth screen and the
// authenticated workspace have to lay their controls out without letting one sit on top of
// another at either viewport size.

export type Box = { label: string; left: number; right: number; top: number; bottom: number; width: number; height: number };

/**
 * Viewport sizes the layout specs cycle over. The desktop / mobile pair matches the MVP
 * spec's checkbox that every core flow has to fit at 1280px and at 390px.
 */
export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const;

export type Viewport = (typeof VIEWPORTS)[number];

const measuredTags = ["a", "button", "input", "select", "summary", "h1", "h2", "h3"];

/**
 * Boxes of everything a User can read or press inside `root`. Nothing is measured against the
 * viewport vertically: a control below the fold is reachable by scrolling, so calling that a
 * defect would condemn every long page. What has to hold is that the control is laid out at
 * all (a non-zero box), stays inside the page horizontally, and does not sit on top of another
 * control. Controls inside a closed `<details>` are not laid out, so they are left out.
 */
export async function measuredBoxes(page: Page, root: string): Promise<Box[]> {
  const selector = measuredTags.map((tag) => `${root} ${tag}`).join(", ");
  return page.locator(selector).evaluateAll((elements) => elements
    .filter((element) => !element.closest("details:not([open])"))
    .map((element) => {
      const box = element.getBoundingClientRect();
      const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
      return {
        label: `${element.tagName.toLowerCase()}:${name.trim().slice(0, 24)}`,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    })
    .filter((box) => box.width > 0 && box.height > 0));
}

function contains(outer: Box, inner: Box) {
  return outer.left <= inner.left + 0.5 && outer.right >= inner.right - 0.5
    && outer.top <= inner.top + 0.5 && outer.bottom >= inner.bottom - 0.5;
}

/**
 * Pairs of controls whose boxes intersect. Nested pairs are skipped: a control drawn inside
 * another one (the password field and its reveal button, for instance) legitimately shares
 * the outer box, and that is padding rather than a collision.
 */
export function overlapping(boxes: Box[]) {
  const collisions: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (contains(a, b) || contains(b, a)) continue;
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (horizontal > 1 && vertical > 1) collisions.push(`${a.label} overlaps ${b.label}`);
    }
  }
  return collisions;
}

/** Controls pushed past the left or right page edge, where they cannot be reached. */
export function clipped(boxes: Box[], viewportWidth: number) {
  return boxes.filter((box) => box.left < -0.5 || box.right > viewportWidth + 0.5).map((box) => box.label);
}

/**
 * Labels of the controls inside `root` that exist in the DOM but only become interactive on
 * hover — `pointer-events: none`, `opacity: 0`, or `visibility: hidden`. Closed `<details>`
 * content is left out because it is not laid out until the user opens it.
 */
export async function hoverOnly(page: Page, root: string) {
  return page.locator(`${root} button, ${root} summary`).evaluateAll((elements) => elements
    .filter((element) => !element.closest("details:not([open])"))
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.pointerEvents === "none" || Number.parseFloat(style.opacity) === 0 || style.visibility === "hidden";
    })
    .map((element) => (element.textContent ?? "").trim().slice(0, 24)));
}
