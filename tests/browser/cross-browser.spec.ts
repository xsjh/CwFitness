import { expect, test } from "./helpers/test";
import {
  completeWorkout,
  openView,
  prepareWorkout,
  recordSet,
  signIn,
  signOut,
  signUp,
  startWorkout,
  uniqueEmail,
} from "./helpers/workspace";

// These three flows are the ones the MVP spec requires on Firefox and WebKit as well as
// Chromium. Playwright only runs a tagged test on the Firefox/WebKit projects, so the
// @cross-browser tag has to stay on the title.

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

test("an account signs up, signs out, and signs back in @cross-browser", async ({ page }) => {
  const email = uniqueEmail("cross-browser-account");
  await signUp(page, { email });
  await expect(page.locator(".workspace-shell")).toBeVisible();

  await signOut(page);
  await signIn(page, { email });

  await expect(page.locator(".workspace-shell")).toBeVisible();
  await expect(page.locator(".workspace-brand")).toContainText(email);
});

test("a Workout Session records a set @cross-browser", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("cross-browser-session") });
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);

  await recordSet(page, { exerciseName: exercise, setIndex: 1, actualValue: 8, actualWeight: 20 });

  await expect(page.locator('[data-testid="active-session"]')).toContainText("1 / 3");
  await expect(page.locator(".training-exercise").filter({ hasText: exercise })).toContainText("目标：8 次 · 20.0 kg · 3 组");
});

test("progress renders a completed Workout Session @cross-browser", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("cross-browser-progress") });
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);
  for (const setIndex of [1, 2, 3]) {
    await recordSet(page, { exerciseName: exercise, setIndex, actualValue: 8, actualWeight: 20 });
  }
  await completeWorkout(page);

  await openView(page, "进展");

  await expect(page.locator(".training-calendar span.completed")).toHaveCount(1);
  await expect(page.locator(".plan-progress article").filter({ hasText: plan })).toContainText("1 场已完成");
  await expect(page.locator(".trend-list li")).toHaveCount(1);
  await expect(page.locator(".trend-list li").first()).toContainText("达成 100%");
});
