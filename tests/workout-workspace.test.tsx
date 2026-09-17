import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkoutWorkspace } from "../app/workout-workspace";

describe("WorkoutWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns to login when a background refresh receives Unauthorized", async () => {
    let authorized = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (!authorized) return Promise.resolve(Response.json({ error: "Unauthorized" }, { status: 401 }));
      const url = String(input);
      if (url === "/api/plans") return Promise.resolve(Response.json({ plans: [] }));
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAuthenticationLost = vi.fn().mockResolvedValue(false);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={onAuthenticationLost} onAccountDeleted={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plans", expect.anything()));

    authorized = false;
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(onAuthenticationLost).toHaveBeenCalledOnce());
  });

  it("loads protected workspace data one request at a time", async () => {
    let resolvePlans: ((response: Response) => void) | undefined;
    const plansResponse = new Promise<Response>((resolve) => { resolvePlans = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/plans") return plansResponse;
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={vi.fn().mockResolvedValue(false)} onAccountDeleted={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plans", expect.anything()));

    expect(fetchMock).not.toHaveBeenCalledWith("/api/exercises", expect.anything());
    resolvePlans?.(Response.json({ plans: [] }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/exercises", expect.anything()));
  });

  it("shows today's data as a bottom text summary without the plan-page prompt", async () => {
    const plans = [{ id: "plan-1", name: "力量计划", archivedAt: null, version: 1, workoutDays: [{ id: "day-1", name: "腿部训练", suggestedWeekday: null, position: 0, version: 1, plannedExercises: [{ id: "planned-1", exerciseId: "exercise-1", setCount: 3, targetValue: 8, weightGrams: 1000, position: 0, version: 1, exercise: { id: "exercise-1", name: "深蹲", resistanceType: "WEIGHTED", targetType: "REPETITIONS", version: 1 } }] }] }];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/plans") return Promise.resolve(Response.json({ plans }));
      if (url === "/api/plans/plan-1/progress") return Promise.resolve(Response.json({ progress: [] }));
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [{ id: "exercise-1", name: "深蹲", resistanceType: "WEIGHTED", targetType: "REPETITIONS", version: 1 }] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [{ localStartDate: "2026-09-16", trainingTimeSeconds: 0 }] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={vi.fn().mockResolvedValue(false)} onAccountDeleted={vi.fn()} />);

    const summary = await screen.findByTestId("today-summary");
    expect(summary.textContent).toContain("今日累计时长：0 分钟（尚未记录）");
    expect(summary.textContent).toContain("最近完成日期：2026-09-16");
    expect(summary.textContent).toContain("计划进度：1 个计划 · 1 个训练日 · 1 个动作");
    expect(summary.querySelectorAll("p")).toHaveLength(3);
    expect(screen.queryByText("也可以进入计划页选择任意训练日。")).toBeNull();

    await userEvent.setup().click(screen.getByRole("button", { name: "点击查看动作详情" }));
    expect(await screen.findByRole("heading", { name: "计划决定目标，训练只记录实际。" })).toBeTruthy();
  });

  it("opens settings as a modal from the User menu instead of the main navigation", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/plans") return Promise.resolve(Response.json({ plans: [] }));
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={vi.fn().mockResolvedValue(false)} onAccountDeleted={vi.fn()} />);
    const navigation = await screen.findByRole("navigation", { name: "主要导航" });
    expect(navigation.textContent).not.toContain("设置");

    await userEvent.setup().click(screen.getByRole("button", { name: /用户菜单/ }));
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "偏好设置" }));

    expect(screen.getByRole("dialog", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "让训练适合你。" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.queryByRole("dialog", { name: "设置" })).toBeNull();
  });

  it("enters an immersive training page without the workspace navigation even when refresh fails", async () => {
    const workoutSession = {
      id: "session-1",
      status: "ACTIVE",
      timeZone: "UTC",
      localStartDate: "2026-09-11",
      startedAt: "2026-09-11T10:00:00.000Z",
      pausedAt: null,
      completedAt: null,
      modifiedAt: "2026-09-11T10:00:00.000Z",
      trainingTimeSeconds: 0,
      lastHeartbeatAt: "2026-09-11T10:00:00.000Z",
      version: 1,
      editingDeviceId: "device-1",
      exercises: [{
        id: "session-exercise-1",
        exerciseId: "exercise-1",
        plannedExerciseId: "planned-1",
        exerciseName: "测试深蹲",
        resistanceType: "WEIGHTED",
        targetType: "REPETITIONS",
        setCount: 3,
        targetValue: 8,
        weightGrams: 1000,
        position: 0,
        source: "PLANNED",
        removedAt: null,
        setResults: [],
      }],
    };
    const plans = [{ id: "plan-1", name: "测试计划", archivedAt: null, version: 1, workoutDays: [{ id: "day-1", name: "测试训练日", suggestedWeekday: null, version: 1, position: 0, plannedExercises: [{ id: "planned-1", exerciseId: "exercise-1", setCount: 3, targetValue: 8, weightGrams: 1000, position: 0, version: 1, exercise: { id: "exercise-1", name: "测试深蹲", resistanceType: "WEIGHTED", targetType: "REPETITIONS", version: 1 } }] }] }];
    let started = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/workout-sessions" && init?.method === "POST") {
        started = true;
        return Promise.resolve(Response.json({ workoutSession }, { status: 201 }));
      }
      if (url === "/api/plans") return Promise.resolve(started ? Response.json({ error: "操作没有完成，请稍后重试。" }, { status: 500 }) : Response.json({ plans }));
      if (url === "/api/plans/plan-1/progress") return Promise.resolve(Response.json({ progress: [] }));
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={vi.fn().mockResolvedValue(false)} onAccountDeleted={vi.fn()} />);
    expect(await screen.findByRole("navigation", { name: "主要导航" })).toBeTruthy();
    // The Today view owns its own start control; the plan page labels its button 开始「训练日」.
    const startButton = await screen.findByRole("button", { name: "开始训练" });
    await userEvent.setup().click(startButton);

    expect(await screen.findByRole("heading", { name: "完成每组后点击一次即可记录。" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "主要导航" })).toBeNull();
    expect(screen.queryByRole("button", { name: /用户菜单/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "训练" })).toBeNull();
    const recordButtons = screen.getAllByRole("button", { name: "记录完成" }) as HTMLButtonElement[];
    expect(recordButtons.length).toBeGreaterThan(0);
    expect(recordButtons.every((button) => !button.disabled)).toBe(true);
  });
});
