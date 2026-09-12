import { clipped, measuredBoxes, overlapping, VIEWPORTS } from "./helpers/layout";
import { expect, test } from "./helpers/test";
import { gotoAuth } from "./helpers/workspace";

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} authentication controls stay reachable without overlap`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoAuth(page);

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();

    const boxes = await measuredBoxes(page, ".app-shell");
    expect(boxes.length).toBeGreaterThan(0);
    expect(clipped(boxes, viewport.width), `${viewport.name} controls outside the page width`).toEqual([]);
    expect(overlapping(boxes), `${viewport.name} controls overlap`).toEqual([]);
  });
}

test("no authentication control depends on hover to appear", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAuth(page);

  const hoverOnly = await page.locator("button, input, a").evaluateAll((elements) => elements
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    })
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.visibility === "hidden" || style.pointerEvents === "none" || Number.parseFloat(style.opacity) === 0;
    })
    .map((element) => `${element.tagName.toLowerCase()}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 24)}`));
  expect(hoverOnly).toEqual([]);
});

test("accessibility preferences replace displacement with a short cross-fade and strengthen surfaces", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await gotoAuth(page);
  const animationSeconds = await page.locator(".auth-form").evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(animationSeconds).toBeGreaterThan(0);
  expect(animationSeconds).toBeLessThanOrEqual(0.3);
  const passwordInput = page.locator('input[name="password"]');
  const revealButton = page.getByRole("button", { name: "显示密码" });
  const [inputBox, buttonBox] = await Promise.all([passwordInput.boundingBox(), revealButton.boundingBox()]);
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(Math.abs((inputBox!.y + inputBox!.height / 2) - (buttonBox!.y + buttonBox!.height / 2))).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
});
