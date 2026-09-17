import { expect, type Page } from "@playwright/test";

// Shared walkthroughs for the browser specs. Every spec starts from a freshly signed-up
// User so the flows do not depend on data another spec left behind.

export const PASSWORD = "browser-suite-password";

type ViewLabel = "今日" | "计划" | "动作" | "历史" | "进展";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

/** Confirms every `window.confirm` the flows raise. Without this Playwright dismisses them. */
export function acceptDialogs(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept());
}

export async function waitForWorkspace(page: Page) {
  await expect(page.locator(".workspace-shell")).toBeVisible();
  await expect(page.locator(".loading-state")).toHaveCount(0);
}

/**
 * The auth screen only reacts to input once React has hydrated, and `AuthExperience` asks for
 * the session from a mount effect, so that request is a dependable "hydration finished" signal.
 * Without it a click lands on a button whose handler is not attached yet and is dropped
 * silently; Firefox and WebKit are slow enough here to lose that race on every run.
 */
function sessionProbe(page: Page) {
  return page.waitForResponse((response) => response.url().includes("/api/auth/get-session"), { timeout: 30_000 });
}

/** Opens the auth screen and waits until it is interactive. */
export async function gotoAuth(page: Page) {
  const hydrated = sessionProbe(page);
  await page.goto("/auth");
  await expect(page.getByTestId("auth-form")).toBeVisible();
  await hydrated;
}

/** Reloads an auth screen (or a signed-in workspace) and waits until it is interactive. */
export async function reloadAuth(page: Page) {
  const hydrated = sessionProbe(page);
  await page.reload();
  await hydrated;
}

export async function signUp(page: Page, options: { email: string; name?: string }) {
  await gotoAuth(page);
  await page.locator(".auth-links button", { hasText: "注册" }).click();
  await page.locator('input[name="name"]').fill(options.name ?? "浏览器测试");
  await page.locator('input[name="email"]').fill(options.email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('[data-testid="auth-form"] button[type="submit"]').click();
  await waitForWorkspace(page);
}

export async function signIn(page: Page, options: { email: string; password?: string }) {
  await expect(page.getByTestId("auth-form")).toBeVisible();
  await page.locator('input[name="email"]').fill(options.email);
  await page.locator('input[name="password"]').fill(options.password ?? PASSWORD);
  await page.locator('[data-testid="auth-form"] button[type="submit"]').click();
  await waitForWorkspace(page);
}

export async function signOut(page: Page) {
  const account = page.locator(".workspace-account");
  await account.getByRole("button", { name: /用户菜单/ }).click();
  await account.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page.getByTestId("auth-form")).toBeVisible();
}

export async function openView(page: Page, label: ViewLabel) {
  await page.locator(".workspace-nav").getByRole("button", { name: label, exact: true }).click();
}

export async function openSettings(page: Page) {
  const account = page.locator(".workspace-account");
  await account.getByRole("button", { name: /用户菜单/ }).click();
  await account.getByRole("menuitem", { name: "偏好设置" }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
}

export async function createExercise(
  page: Page,
  options: { name: string; resistanceType?: "WEIGHTED" | "BODYWEIGHT"; targetType?: "REPETITIONS" | "DURATION" },
) {
  await openView(page, "动作");
  const form = page.locator("form.toolbar-form");
  await form.locator('input[name="name"]').fill(options.name);
  await form.locator('select[name="resistanceType"]').selectOption(options.resistanceType ?? "WEIGHTED");
  await form.locator('select[name="targetType"]').selectOption(options.targetType ?? "REPETITIONS");
  await form.getByRole("button", { name: "新建动作" }).click();
  await expect(page.locator(".exercise-row").filter({ hasText: options.name })).toBeVisible();
}

export async function createPlanWithDay(page: Page, options: { planName: string; dayName: string }) {
  await openView(page, "计划");
  // "新建计划" opens the inline composer rather than being a permanent form on the page.
  await page.getByRole("button", { name: "新建计划" }).click();
  const planForm = page.getByTestId("plan-form");
  await planForm.locator('input[name="name"]').fill(options.planName);
  await planForm.getByRole("button", { name: "创建计划" }).click();
  await expect(page.locator(".plan-view .plan-name")).toHaveText(options.planName);

  // The new plan becomes the current one, so the day strip offers adding a Workout Day.
  await page.getByRole("button", { name: "＋ 训练日" }).click();
  const dayForm = page.locator(".plan-view .editor").filter({ has: page.getByRole("button", { name: "创建训练日" }) });
  await dayForm.locator('input[name="name"]').fill(options.dayName);
  await dayForm.getByRole("button", { name: "创建训练日" }).click();
  await expect(page.locator(".plan-view .chip").filter({ hasText: options.dayName })).toBeVisible();
}

export async function addPlannedExercise(
  page: Page,
  options: { exerciseName: string; setCount?: number; targetValue?: number; weight?: number },
) {
  await page.getByRole("button", { name: "＋ 添加动作" }).click();
  const composer = page.locator(".plan-view .editor").filter({ has: page.locator(".exercise-search") });
  // Pick from the searchable list rather than a <select>: the composer is a picker now.
  await composer.locator(".exercise-search").fill(options.exerciseName);
  await composer.locator(".search-results button", { hasText: options.exerciseName }).first().click();

  await composer.locator('input[name="setCount"]').fill(String(options.setCount ?? 3));
  await composer.locator('input[name="targetValue"]').fill(String(options.targetValue ?? 8));
  if (options.weight !== undefined) {
    await composer.locator('input[name="weight"]').fill(String(options.weight));
  }
  await composer.getByRole("button", { name: "加进这个训练日" }).click();
  await expect(page.getByTestId("planned-row").filter({ hasText: options.exerciseName })).toBeVisible();
}

export async function startWorkout(page: Page) {
  await page.locator(".plan-view .start-workout").click();
  await expect(page.getByRole("heading", { name: "完成每组后点击一次即可记录。" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要导航" })).toHaveCount(0);
  await expect(page.locator('[data-testid="active-session"]')).toBeVisible();
}

export function exerciseCard(page: Page, exerciseName: string) {
  return page.locator(".training-exercise").filter({ hasText: exerciseName });
}

export function setRow(page: Page, exerciseName: string, setIndex: number) {
  return exerciseCard(page, exerciseName).locator(".set-row").nth(setIndex - 1);
}

export async function recordSet(
  page: Page,
  options: { exerciseName: string; setIndex: number; actualValue: number; actualWeight?: number },
) {
  const row = setRow(page, options.exerciseName, options.setIndex);
  await row.locator('input[name="actualValue"]').fill(String(options.actualValue));
  if (options.actualWeight !== undefined) {
    await row.locator('input[name="actualWeight"]').fill(String(options.actualWeight));
  }
  await row.getByRole("button", { name: "记录完成" }).click();
  await expect(row).toHaveClass(/recorded/);
}

export async function completeWorkout(page: Page) {
  await page.getByRole("button", { name: "结束训练" }).click();
  await expect(page.getByRole("navigation", { name: "主要导航" })).toBeVisible();
  await expect(page.locator(".history-list")).toBeVisible();
}

/** Signs a User up and builds one Weighted Exercise inside one Workout Day. */
export async function prepareWorkout(
  page: Page,
  names: { exercise: string; plan: string; day: string; targetValue?: number; weight?: number },
) {
  await createExercise(page, { name: names.exercise });
  await createPlanWithDay(page, { planName: names.plan, dayName: names.day });
  await addPlannedExercise(page, {
    exerciseName: names.exercise,
    setCount: 3,
    targetValue: names.targetValue ?? 8,
    weight: names.weight ?? 20,
  });
}
