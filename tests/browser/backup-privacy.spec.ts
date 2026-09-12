import { expect, test } from "./helpers/test";
import {
  PASSWORD,
  createPlanWithDay,
  openView,
  prepareWorkout,
  reloadAuth,
  signUp,
  uniqueEmail,
} from "./helpers/workspace";

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

test("a JSON backup is exported and restored over the current workspace", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("backup") });
  await prepareWorkout(page, { exercise, plan, day });

  await openView(page, "设置");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 JSON 备份" }).click(),
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  await expect(page.locator("p.workspace-notice").first()).toContainText("JSON 备份已导出。");

  // Change the workspace after the export, so the restore has something to undo.
  await createPlanWithDay(page, { planName: "之后新增的计划", dayName: "临时训练日" });
  await expect(page.locator(".plan-index-item")).toHaveCount(2);

  await openView(page, "设置");
  await page.locator('input[type="file"]').setInputFiles(backupPath!);
  await expect(page.getByText("将替换：1 个计划")).toBeVisible();
  await page.getByRole("button", { name: "确认恢复并替换数据" }).click();
  // Restoring replaces the workspace and then notifies the other tabs, so either the
  // restore notice or the "data recovered" notice is the one left on screen.
  await expect(page.locator("p.workspace-notice").first()).toContainText(/备份已恢复|已检测到数据恢复/);

  await openView(page, "计划");
  await expect(page.locator(".plan-index-item")).toHaveCount(1);
  await expect(page.locator(".plan-index-item").first()).toContainText(plan);
  await expect(page.locator(".planned-row")).toContainText(exercise);
});

test("a User turns telemetry off and permanently deletes the account", async ({ page }) => {
  const email = uniqueEmail("deletion");
  await signUp(page, { email });
  await prepareWorkout(page, { exercise, plan, day });
  await openView(page, "设置");

  const privacy = page.locator("section.danger-zone").filter({ hasText: "隐私" });
  const telemetry = privacy.getByRole("checkbox");
  await expect(telemetry).toBeEnabled();
  await expect(telemetry).toBeChecked();
  // The checkbox is controlled by the saved preference, so its state only flips once the
  // PATCH resolves. `uncheck()` would assert on the intermediate render and fail.
  await telemetry.click();
  await expect(telemetry).not.toBeChecked();
  await expect(page.locator("p.workspace-notice").first()).toContainText("最小遥测已关闭");

  const deletion = page.locator("section.danger-zone").filter({ hasText: "删除用户" });
  await deletion.getByRole("button", { name: "查看删除影响" }).click();
  await expect(deletion).toContainText("将永久删除：1 个计划、1 个动作");

  // Deletion cannot be completed accidentally: the control stays disabled until the
  // User types the confirmation phrase, and this is the only confirmation on screen.
  const confirmButton = deletion.getByRole("button", { name: "永久删除用户" });
  await expect(confirmButton).toBeDisabled();
  await deletion.locator("input").fill("DELETE");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(page.getByTestId("auth-form")).toBeVisible();

  // Nothing survives the deletion, so even a reload cannot restore the workspace.
  await reloadAuth(page);
  await expect(page.getByTestId("auth-form")).toBeVisible();
  await expect(page.locator(".workspace-shell")).toHaveCount(0);

  // The reload also resets the form to sign-in, so these credentials are submitted as a
  // sign-in attempt rather than as a second sign-up for the same address.
  await expect(page.locator(".auth-links button", { hasText: "注册" })).toBeVisible();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('[data-testid="auth-form"] button[type="submit"]').click();
  await expect(page.locator(".status.error")).toBeVisible();
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
});
