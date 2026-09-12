import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  completeWorkout,
  openView,
  prepareWorkout,
  recordSet,
  signUp,
  startWorkout,
  uniqueEmail,
} from "./helpers/workspace";

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

test.beforeEach(async ({ page }) => {
  acceptDialogs(page);
});

test("progress views report per-Exercise trends and plan completion", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("progress") });
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);
  for (const setIndex of [1, 2, 3]) {
    await recordSet(page, { exerciseName: exercise, setIndex, actualValue: 8, actualWeight: 20 });
  }
  await completeWorkout(page);

  await openView(page, "进展");

  // The calendar marks the training day and the plan reports its own completion.
  await expect(page.locator(".training-calendar span.completed")).toHaveCount(1);
  await expect(page.locator(".plan-progress article").filter({ hasText: plan })).toContainText("1 场已完成");
  await expect(page.locator(".recent-sessions li").first()).toContainText(day);

  // The trend belongs to one Exercise inside one Workout Plan.
  await expect(page.locator(".trend-list li")).toHaveCount(1);
  await expect(page.locator(".trend-list li").first()).toContainText("达成 100%");
  await expect(page.locator(".trend-list li").first()).toContainText("20.0 kg");
  await expect(page.locator(".trend-controls select").first()).toHaveValue(/.+/);
  await expect(page.locator(".trend-controls select").nth(1).locator("option")).toHaveText([exercise]);

  // Range switches re-filter the same trend rather than mixing plans together.
  await page.getByRole("button", { name: "全部" }).click();
  await expect(page.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".trend-list li")).toHaveCount(1);
  await page.getByRole("button", { name: "最近 4 周" }).click();
  await expect(page.getByRole("button", { name: "最近 4 周" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".trend-list li")).toHaveCount(1);
});

test("progress stays empty until a Workout Session is completed", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("progress-empty") });
  await prepareWorkout(page, { exercise, plan, day });
  await openView(page, "进展");

  await expect(page.locator(".training-calendar span.completed")).toHaveCount(0);
  await expect(page.locator(".plan-progress article").filter({ hasText: plan })).toContainText("0 场已完成");
  await expect(page.locator(".trend-list li")).toHaveCount(0);
  await expect(page.locator(".trend-panel .empty-state")).toContainText("这个计划中的动作完成训练后会形成趋势。");
});
