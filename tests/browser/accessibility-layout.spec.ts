import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} authentication controls remain keyboard reachable without overlap`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    const boxes = await page.locator("button, input, a").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    }));
    expect(boxes.every((box) => box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= viewport.width && box.top >= 0 && box.bottom <= viewport.height)).toBe(true);
  });
}

test("accessibility preferences remove displacement and strengthen surfaces", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  await expect(page.getByTestId("auth-form")).toBeVisible();
  expect(Number.parseFloat(await page.locator(".auth-form").evaluate((element) => getComputedStyle(element).animationDuration))).toBeLessThanOrEqual(0.01);
  const passwordInput = page.locator('input[name="password"]');
  const revealButton = page.getByRole("button", { name: "显示密码" });
  const [inputBox, buttonBox] = await Promise.all([passwordInput.boundingBox(), revealButton.boundingBox()]);
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(Math.abs((inputBox!.y + inputBox!.height / 2) - (buttonBox!.y + buttonBox!.height / 2))).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
});
