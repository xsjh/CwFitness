import { expect, test } from "@playwright/test";

test("a User can sign up, sign out, and sign back in", async ({ page }) => {
  const email = `browser-smoke-${crypto.randomUUID()}@example.com`;
  const password = "browser-smoke-password";

  await page.goto("/");
  await page.getByRole("button", { name: "注册" }).click();
  await page.getByLabel("称呼").fill("Browser Smoke");
  await page.getByLabel("邮箱").fill(email);
  await page.getByRole("textbox", { name: /密码/ }).fill(password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.locator(".workspace-shell")).toBeVisible();

  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByTestId("auth-form")).toBeVisible();

  await page.getByLabel("邮箱").fill(email);
  await page.getByRole("textbox", { name: /密码/ }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.locator(".workspace-shell")).toBeVisible();
});
