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

  await page.getByRole("button", { name: "动作" }).click();
  await expect(page.getByLabel("负重方式")).toHaveCSS("backdrop-filter", "blur(16px) saturate(1.25)");
  await page.getByLabel("动作名称").fill("测试深蹲");
  await page.getByRole("button", { name: "新建动作" }).click();
  const renameEditor = page.locator(".inline-editor").first();
  await renameEditor.getByText("改名", { exact: true }).click();
  await expect(renameEditor).toHaveAttribute("open", "");
  await renameEditor.locator('input[name="name"]').fill("已改名深蹲");
  await renameEditor.getByRole("button", { name: "保存名称" }).click();
  await expect(renameEditor).not.toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "已改名深蹲" })).toBeVisible();
  await expect(page.getByRole("status", { name: "动作名称已更新。" })).toBeHidden({ timeout: 5_000 });

  await page.getByLabel("动作名称").fill("测试平板支撑");
  await page.getByLabel("负重方式").selectOption("BODYWEIGHT");
  await page.getByLabel("记录指标").selectOption("DURATION");
  await page.getByRole("button", { name: "新建动作" }).click();

  await page.getByRole("button", { name: "计划" }).click();
  await page.getByLabel("新计划名称").fill("浏览器测试计划");
  await page.getByRole("button", { name: "创建计划" }).click();
  await page.getByLabel("训练日名称").fill("测试训练日");
  await page.getByRole("button", { name: "添加训练日" }).click();

  await page.getByText("添加动作", { exact: true }).click();
  await page.getByLabel("动作").selectOption({ label: "已改名深蹲" });
  await expect(page.getByLabel("目标次数")).toBeVisible();
  await expect(page.getByLabel(/重量 kg/)).toBeVisible();
  await page.getByLabel("动作").selectOption({ label: "测试平板支撑" });
  await expect(page.getByLabel("目标时长（秒）")).toBeVisible();
  await expect(page.getByLabel(/重量 kg/)).toBeHidden();
  await page.getByRole("button", { name: "添加动作" }).click();
  await expect(page.getByText("添加动作", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试平板支撑" })).toBeVisible();
});
