import { expect, test, type Page } from "./helpers/test";
import {
  completeWorkout,
  createExercise,
  createPlanWithDay,
  openView,
  prepareWorkout,
  recordSet,
  setRow,
  signUp,
  startWorkout,
  uniqueEmail,
} from "./helpers/workspace";

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

/** Leaves one Completed Session behind, for the history specs. */
async function seedCompletedSession(page: Page) {
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);
  for (const setIndex of [1, 2, 3]) {
    await recordSet(page, { exerciseName: exercise, setIndex, actualValue: 8, actualWeight: 20 });
  }
  await completeWorkout(page);
}

test("a Workout Session records sets, pauses, resumes, and completes", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("session") });
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);

  await recordSet(page, { exerciseName: exercise, setIndex: 1, actualValue: 8, actualWeight: 20 });
  await recordSet(page, { exerciseName: exercise, setIndex: 2, actualValue: 9, actualWeight: 22.5 });
  await expect(page.locator(".session-summary")).toContainText("2 / 3");

  // A Paused Session freezes its records and cannot be edited until it resumes.
  await page.getByRole("button", { name: "挂起" }).click();
  await expect(page.locator('[data-testid="active-session"]')).toContainText("已挂起");
  await expect(setRow(page, exercise, 3).locator('input[name="actualValue"]')).toBeDisabled();
  await expect(page.getByRole("button", { name: "记录完成" }).first()).toBeDisabled();

  await page.getByRole("button", { name: "继续训练" }).click();
  await expect(page.locator('[data-testid="active-session"]')).toContainText("进行中");

  await recordSet(page, { exerciseName: exercise, setIndex: 3, actualValue: 8, actualWeight: 20 });
  await expect(page.locator(".session-summary")).toContainText("3 / 3");

  await completeWorkout(page);
  await expect(page.locator(".history-session").first()).toContainText(day);
  await expect(page.locator(".history-results").first()).toContainText("达成 100%");
});

test("an Added Exercise joins the Session without changing the Workout Day", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("added") });
  await prepareWorkout(page, { exercise, plan, day });
  await createExercise(page, { name: "农夫行走", resistanceType: "BODYWEIGHT", targetType: "DURATION" });
  await openView(page, "计划");
  await startWorkout(page);

  const addForm = page.locator("form.session-add-form");
  await addForm.locator('select[name="exerciseId"]').selectOption({ label: "农夫行走" });
  await expect(addForm.locator('input[name="targetValue"]')).toBeVisible();
  await expect(addForm.locator('input[name="weight"]')).toBeHidden();
  await addForm.locator('input[name="setCount"]').fill("2");
  await addForm.locator('input[name="targetValue"]').fill("45");
  // Keep the Workout Day as it is: the Added Exercise must stay inside this Session only.
  await addForm.locator('input[name="saveToWorkoutDay"]').uncheck();
  await addForm.locator('button[type="submit"]').click();

  const added = page.locator(".training-exercise").filter({ hasText: "农夫行走" });
  await expect(added).toBeVisible();
  await expect(added.locator(".tag")).toHaveText("训练中追加");
  await expect(added).toContainText("目标：45 秒 · 2 组");

  await recordSet(page, { exerciseName: "农夫行走", setIndex: 1, actualValue: 45 });
  await expect(page.locator(".session-summary")).toContainText("1 / 5");

  await completeWorkout(page);
  await page.locator(".workspace-nav").getByRole("button", { name: "计划", exact: true }).click();
  await expect(page.locator(".planned-row")).toHaveCount(1);
  await expect(page.locator(".planned-row")).not.toContainText("农夫行走");
});

test("a Completed Session is corrected and permanently deleted from history", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("history") });
  await seedCompletedSession(page);

  const session = page.locator(".history-session").first();
  const correction = session.locator("details.history-correction").first();
  await correction.locator("summary").click();
  const firstSet = correction.locator("form").first();
  await firstSet.locator('input[name="actualValue"]').fill("12");
  await firstSet.getByRole("button", { name: "保存" }).click();

  await expect(page.locator("p.workspace-notice").first()).toContainText("第 1 组历史记录已修正。");
  await expect(session.locator(".history-summary-meta")).toContainText("已修正");
  await expect(session).toContainText("第 1 组：12 次");

  // Deletion asks for confirmation twice before it removes anything.
  await session.getByRole("button", { name: "永久删除训练" }).click();
  await expect(page.locator(".empty-state")).toContainText("完成第一场训练后");
  await expect(page.locator(".history-session")).toHaveCount(0);
});

test("a Workout Day without exercises cannot start a Workout Session", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("empty-day") });
  await createPlanWithDay(page, { planName: plan, dayName: day });

  await expect(page.locator(".day-detail .empty-state")).toContainText("从动作库选择一个动作");
  await expect(page.locator(".planned-row")).toHaveCount(0);
  await expect(page.locator(".day-title-row").getByRole("button", { name: "开始训练" })).toBeDisabled();
});

test("an archived Workout Plan cannot start new Workout Sessions", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("archived") });
  await prepareWorkout(page, { exercise, plan, day });

  await page.getByRole("button", { name: "归档计划" }).click();
  await expect(page.locator("p.workspace-notice").first()).toContainText("计划已归档。");
  await expect(page.locator(".plan-index-item").first()).toContainText("已归档");
  await expect(page.locator(".day-title-row").getByRole("button", { name: "计划已归档" })).toBeDisabled();

  await page.getByRole("button", { name: "恢复计划" }).click();
  await expect(page.locator(".day-title-row").getByRole("button", { name: "开始训练" })).toBeEnabled();
});
