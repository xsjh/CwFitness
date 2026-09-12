import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  prepareWorkout,
  recordSet,
  setRow,
  signUp,
  startWorkout,
  uniqueEmail,
  waitForWorkspace,
} from "./helpers/workspace";

const exercise = "杠铃深蹲";
const plan = "力量基础";
const day = "推日";

test.beforeEach(async ({ page }) => {
  acceptDialogs(page);
});

test("a Workout Session recorded offline syncs once when the connection returns", async ({ page }) => {
  await signUp(page, { email: uniqueEmail("offline") });
  await prepareWorkout(page, { exercise, plan, day });
  await startWorkout(page);

  await recordSet(page, { exerciseName: exercise, setIndex: 1, actualValue: 8, actualWeight: 20 });

  await page.context().setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await recordSet(page, { exerciseName: exercise, setIndex: 2, actualValue: 9, actualWeight: 22.5 });
  await expect(page.getByText("1 项训练记录正在等待同步。")).toBeVisible();
  // The record is kept on the device even though no server has seen it yet.
  await expect(setRow(page, exercise, 2)).toHaveClass(/recorded/);

  await page.context().setOffline(false);
  await expect(page.getByText("1 项训练记录正在等待同步。")).toHaveCount(0);
  await expect(page.getByText("当前处于离线状态。")).toHaveCount(0);

  // Reloading proves the server accepted the replayed record, and that the replay did not
  // write the set a second time.
  await page.reload();
  await waitForWorkspace(page);
  await page.getByRole("button", { name: "继续进入训练" }).click();
  await expect(page.locator('[data-testid="active-session"]')).toContainText("2 / 3");
  await expect(setRow(page, exercise, 2).locator('input[name="actualValue"]')).toHaveValue("9");
  await expect(setRow(page, exercise, 1).locator('input[name="actualValue"]')).toHaveValue("8");
});
