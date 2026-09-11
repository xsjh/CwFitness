"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExerciseLibrary, type NewExerciseInput } from "./exercise-library";
import { PlanEditor, type PlannedExerciseInput } from "./plan-editor";
import { TrainingPanel } from "./training-panel";
import { WorkoutHistory } from "./workout-history";
import { dailyTrainingTime, ProgressView } from "./progress-view";
import { SettingsPanel } from "./settings-panel";
import {
  applySessionMutation,
  clearWorkoutSessionDraft,
  enqueueSessionMutation,
  loadWorkoutSessionDraft,
  queuedSessionMutations,
  replaySessionMutations,
  saveWorkoutSessionDraft,
  type NewSessionMutation,
} from "./workout-outbox";
import { weightInGrams } from "../lib/weights";
import type { Exercise, ExerciseProgress, Plan, PlannedExercise, WorkoutDay, WorkoutHistorySession, WorkoutSession, WorkspaceView } from "./workout-types";

type WorkoutWorkspaceProps = {
  user: { id: string; name: string; email: string };
  deviceId: string;
  onSignOut: () => Promise<void>;
  onAccountDeleted: () => void;
};

class ApiError extends Error {
  status: number;
  code?: string;
  current?: unknown;

  constructor(message: string, status: number, body: { code?: string; current?: unknown } | null) {
    super(message);
    this.status = status;
    this.code = body?.code;
    this.current = body?.current;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string; current?: unknown } | null;
    throw new ApiError(body?.error ?? "操作没有完成，请稍后重试。", response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "操作没有完成，请稍后重试。";
}

export function WorkoutWorkspace({ user, deviceId, onSignOut, onAccountDeleted }: WorkoutWorkspaceProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [workoutSessions, setWorkoutSessions] = useState<WorkoutHistorySession[]>([]);
  const [progress, setProgress] = useState<ExerciseProgress[]>([]);
  const [settings, setSettings] = useState<{ timeZone: string; weightUnit: "kg" | "lb" }>({ timeZone: "UTC", weightUnit: "kg" });
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [view, setView] = useState<WorkspaceView>("today");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const [offline, setOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [dataVersion, setDataVersion] = useState<number | null>(null);
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  const telemetryPageRecorded = useRef(false);

  function recordTelemetry(category: "page_visit" | "feature_operation" | "sync_failure" | "sanitized_error") {
    if (telemetryEnabled !== true) return;
    void fetch("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category }) }).catch(() => undefined);
  }

  const restoreDraft = useCallback(async () => {
    const draft = await loadWorkoutSessionDraft(user.id);
    if (!draft) return false;
    setSession(draft.session);
    setExercises(draft.exercises);
    setSettings(draft.settings);
    setView("training");
    setOffline(true);
    setPendingSync((await queuedSessionMutations(user.id)).length);
    return true;
  }, [user.id]);

  const syncPendingMutations = useCallback(async () => {
    return replaySessionMutations(user.id, (mutation) => apiRequest(mutation.request.path, {
      method: mutation.request.method,
      body: mutation.request.body,
    }));
  }, [user.id]);

  const loadData = useCallback(async () => {
    const pending = await queuedSessionMutations(user.id);
    setPendingSync(pending.length);
    if (!navigator.onLine) {
      if (!(await restoreDraft())) throw new Error("当前离线，且没有可恢复的训练草稿。");
      return;
    }
    if (pending.length > 0) {
      const replay = await syncPendingMutations();
      if (!replay.ok) {
        await restoreDraft();
        setSyncError(errorText(replay.error));
        return;
      }
    }

    const [plansBody, exercisesBody, sessionBody, historyBody, settingsBody, versionBody, privacyBody] = await Promise.all([
      apiRequest<{ plans: Plan[] }>("/api/plans", { cache: "no-store" }),
      apiRequest<{ exercises: Exercise[] }>("/api/exercises", { cache: "no-store" }),
      apiRequest<{ workoutSession: WorkoutSession | null }>("/api/workout-sessions/active", { cache: "no-store" }),
      apiRequest<{ workoutSessions: WorkoutHistorySession[] }>("/api/workout-sessions", { cache: "no-store" }),
      apiRequest<{ settings: { timeZone: string; weightUnit: "kg" | "lb" } }>("/api/settings", { cache: "no-store" }),
      apiRequest<{ dataVersion: number }>("/api/backup/version", { cache: "no-store" }),
      apiRequest<{ telemetryEnabled: boolean }>("/api/privacy", { cache: "no-store" }),
    ]);
    setPlans(plansBody.plans);
    setExercises(exercisesBody.exercises);
    setSession(sessionBody.workoutSession);
    setWorkoutSessions(historyBody.workoutSessions);
    setSettings(settingsBody.settings);
    setDataVersion(versionBody.dataVersion);
    setTelemetryEnabled(privacyBody.telemetryEnabled);
    setOffline(false);
    setSyncError("");
    setPendingSync(0);
    setConflict(null);
    if (sessionBody.workoutSession) {
      await saveWorkoutSessionDraft(user.id, {
        session: sessionBody.workoutSession,
        exercises: exercisesBody.exercises,
        settings: settingsBody.settings,
      });
    } else {
      await clearWorkoutSessionDraft(user.id);
    }
    setSelectedPlanId((current) => current || plansBody.plans[0]?.id || "");
    const progressBodies = await Promise.all(plansBody.plans.map((plan) => apiRequest<{ progress: ExerciseProgress[] }>(`/api/plans/${plan.id}/progress`, { cache: "no-store" })));
    setProgress(progressBodies.flatMap((body) => body.progress));
  }, [restoreDraft, syncPendingMutations, user.id]);

  useEffect(() => {
    const channel = new BroadcastChannel("cwfitness-backup");
    channel.onmessage = () => { void loadData().then(() => setNotice("已检测到数据恢复，页面已更新。")); };
    const timer = window.setInterval(() => {
      void apiRequest<{ dataVersion: number }>("/api/backup/version", { cache: "no-store" }).then((body) => {
        if (dataVersion !== null && body.dataVersion !== dataVersion) { void loadData().then(() => setNotice("已检测到其他设备恢复的数据，页面已更新。")); }
      }).catch(() => undefined);
    }, 30_000);
    return () => { window.clearInterval(timer); channel.close(); };
  }, [dataVersion, loadData]);

  useEffect(() => { if (telemetryEnabled === true && !telemetryPageRecorded.current) { telemetryPageRecorded.current = true; void fetch("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "page_visit" }) }).catch(() => undefined); } }, [telemetryEnabled]);

  useEffect(() => {
    if (!notice || notice.includes("失败")) return;
    const timer = window.setTimeout(() => setNotice(""), 3_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true;
    // Initial workspace data is loaded from the server after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
      .catch((error) => {
        if (active) setNotice(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!session || session.status !== "ACTIVE") return;
    const heartbeat = () => {
      void apiRequest(`/api/workout-sessions/${session.id}/heartbeat`, { method: "POST", body: "{}" }).catch((error) => {
        void loadData().then(() => setNotice(
          error instanceof ApiError && error.code === "SESSION_TAKEN_OVER"
            ? "另一台设备已接管训练，当前页面已切换为只读。"
            : "训练已因长时间无活动而挂起；确认后可继续训练。",
        ));
      });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [loadData, session]);

  useEffect(() => {
    const reconnect = () => { void loadData(); };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [loadData]);

  async function runMutation<T>(action: () => Promise<T>, successMessage: string) {
    setBusy(true);
    setNotice("");
    try {
      const result = await action();
      await loadData();
      recordTelemetry("feature_operation");
      setNotice(successMessage);
      return result;
    } catch (error) {
      recordTelemetry(error instanceof ApiError && error.code === "SYNC_FAILURE" ? "sync_failure" : "sanitized_error");
      if (error instanceof ApiError && (error.code === "VERSION_CONFLICT" || error.code === "SESSION_TAKEN_OVER")) {
        await loadData().catch(() => undefined);
        setConflict(error);
      }
      setNotice(errorText(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function mutateSession(mutation: NewSessionMutation, successMessage: string) {
    if (!session) return;
    setBusy(true);
    setNotice("已保存在本机，等待同步。");
    setSyncError("");
    try {
      const nextSession = applySessionMutation(session, mutation);
      setSession(nextSession);
      await saveWorkoutSessionDraft(user.id, { session: nextSession, exercises, settings });
      await enqueueSessionMutation(user.id, mutation);
      setPendingSync((current) => current + 1);

      if (navigator.onLine) {
        const replay = await syncPendingMutations();
        if (replay.ok) {
          await loadData();
          setNotice(successMessage);
        } else {
          setPendingSync(replay.remaining.length);
          setSyncError(errorText(replay.error));
          if (replay.error instanceof ApiError && (replay.error.code === "VERSION_CONFLICT" || replay.error.code === "SESSION_TAKEN_OVER")) {
            setConflict(replay.error);
          }
          setNotice("同步没有完成，已保留本地记录。修复连接或冲突后可重试。");
        }
      }
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan(name: string) {
    const result = await runMutation(
      () => apiRequest<{ plan: Plan }>("/api/plans", { method: "POST", body: JSON.stringify({ name }) }),
      "训练计划已创建。",
    );
    if (result) setSelectedPlanId(result.plan.id);
  }

  async function renamePlan(plan: Plan, name: string) {
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ name, version: plan.version }) }),
      "计划名称已更新。",
    );
  }

  async function updatePlanVisual(plan: Plan, accentColor: string, coverKey: string) {
    await runMutation(() => apiRequest(`/api/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ accentColor, coverKey, version: plan.version }) }), "计划视觉已更新。");
  }

  async function createDay(plan: Plan, name: string, suggestedWeekday: number | null) {
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days`, {
        method: "POST",
        body: JSON.stringify({ name, suggestedWeekday, version: plan.version }),
      }),
      "训练日已添加。",
    );
  }

  async function updateDay(plan: Plan, day: WorkoutDay, name: string, suggestedWeekday: number | null) {
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days/${day.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, suggestedWeekday, version: day.version }),
      }),
      "训练日设置已更新。",
    );
  }

  async function deleteDay(plan: Plan, day: WorkoutDay) {
    if (!window.confirm(`删除“${day.name}”？历史训练仍会保留。`)) return;
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days/${day.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: day.version }),
      }),
      "训练日已删除。",
    );
  }

  async function addPlannedExercise(plan: Plan, day: WorkoutDay, input: PlannedExerciseInput) {
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days/${day.id}/exercises`, {
        method: "POST",
        body: JSON.stringify({ ...input, version: day.version }),
      }),
      "动作目标已添加。",
    );
  }

  async function updatePlannedExercise(
    plan: Plan,
    day: WorkoutDay,
    planned: PlannedExercise,
    input: Omit<PlannedExerciseInput, "exerciseId">,
  ) {
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, version: planned.version }),
      }),
      "动作目标已更新。",
    );
  }

  async function deletePlannedExercise(plan: Plan, day: WorkoutDay, planned: PlannedExercise) {
    if (!window.confirm(`从“${day.name}”移除“${planned.exercise.name}”？`)) return;
    await runMutation(
      () => apiRequest(`/api/plans/${plan.id}/days/${day.id}/exercises/${planned.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: planned.version }),
      }),
      "动作已从训练日移除。",
    );
  }

  async function createExercise(input: NewExerciseInput) {
    await runMutation(
      () => apiRequest("/api/exercises", { method: "POST", body: JSON.stringify(input) }),
      "动作已创建。",
    );
  }

  async function renameExercise(exercise: Exercise, name: string) {
    await runMutation(
      () => apiRequest(`/api/exercises/${exercise.id}`, { method: "PATCH", body: JSON.stringify({ name, version: exercise.version }) }),
      "动作名称已更新。",
    );
  }

  async function deleteExercise(exercise: Exercise) {
    try {
      setBusy(true);
      const impact = await apiRequest<{
        exercise: { plannedExerciseCount: number; sessionExerciseCount: number; version: number };
      }>(`/api/exercises/${exercise.id}`, { cache: "no-store" });
      setBusy(false);
      const confirmed = window.confirm(
        `永久删除“${exercise.name}”？\n影响 ${impact.exercise.plannedExerciseCount} 个计划目标和 ${impact.exercise.sessionExerciseCount} 条历史动作记录。此操作不可恢复。`,
      );
      if (!confirmed) return;
      await runMutation(
        () => apiRequest(`/api/exercises/${exercise.id}`, {
          method: "DELETE",
          body: JSON.stringify({ confirmation: "DELETE", version: impact.exercise.version }),
        }),
        "动作及其历史记录已永久删除。",
      );
    } catch (error) {
      setBusy(false);
      setNotice(errorText(error));
    }
  }

  async function startWorkout(day: WorkoutDay) {
    setBusy(true);
    setNotice("");
    try {
      await apiRequest<{ workoutSession: WorkoutSession }>("/api/workout-sessions", {
        method: "POST",
        body: JSON.stringify({ workoutDayId: day.id, timeZone: settings.timeZone }),
      });
      await loadData();
      setView("training");
      setNotice("训练已开始，目标已经锁定。")
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function recordSet(exercise: WorkoutSession["exercises"][number], setIndex: number, input: { actualValue: number; actualWeight?: number } | null) {
    if (!session) return;
    const operationId = crypto.randomUUID();
    const actualWeightGrams = exercise.resistanceType === "WEIGHTED" && input?.actualWeight !== undefined
      ? weightInGrams(input.actualWeight, settings.weightUnit)
      : null;
    const result = input === null
      ? { actualValue: null, actualWeightGrams: null, skipped: true }
      : {
          actualValue: input.actualValue,
          actualWeightGrams,
          skipped: false,
        };
    const payload = input === null
      ? { skipped: true }
      : {
          actualValue: input.actualValue,
          ...(exercise.resistanceType === "WEIGHTED"
            ? { actualWeight: input.actualWeight, weightUnit: settings.weightUnit }
            : {}),
        };
    const path = `/api/workout-sessions/${session.id}/exercises/${exercise.id}/sets/${setIndex}`;
    const versionedBody = JSON.stringify({ ...payload, operationId, version: session.version });
    await mutateSession(
      {
        kind: "set",
        operationId,
        sessionExerciseId: exercise.id,
        setIndex,
        result,
        request: { method: "PUT", path, body: versionedBody },
      },
      input === null ? `第 ${setIndex} 组已跳过。` : `第 ${setIndex} 组已记录。`,
    );
  }

  async function setPlanArchived(plan: Plan, archived: boolean) {
    await runMutation(() => apiRequest(`/api/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ archived, version: plan.version }) }), archived ? "计划已归档。" : "计划已恢复。");
  }

  async function addSessionExercise(input: { exerciseId: string; setCount: number; targetValue: number; weight?: number; saveToWorkoutDay: boolean }) {
    if (!session) return;
    const exercise = exercises.find((item) => item.id === input.exerciseId);
    if (!exercise) return;
    const clientId = crypto.randomUUID();
    const weightGrams = exercise.resistanceType === "WEIGHTED"
      ? weightInGrams(input.weight, settings.weightUnit)
      : null;
    await mutateSession(
      {
        kind: "add-exercise",
        operationId: clientId,
        exercise: {
          id: clientId,
          exerciseId: exercise.id,
          plannedExerciseId: null,
          exerciseName: exercise.name,
          resistanceType: exercise.resistanceType,
          targetType: exercise.targetType,
          setCount: input.setCount,
          targetValue: input.targetValue,
          weightGrams,
          position: session.exercises.length,
          source: "ADDED",
          removedAt: null,
          setResults: [],
        },
        request: {
          method: "POST",
          path: `/api/workout-sessions/${session.id}/exercises`,
          body: JSON.stringify({ ...input, clientId, ...(input.weight === undefined ? {} : { weightUnit: settings.weightUnit }), version: session.version }),
        },
      },
      "动作已追加到本次训练。",
    );
  }

  async function removeSessionExercise(exercise: WorkoutSession["exercises"][number]) {
    if (!session || !window.confirm(`从本次训练移除“${exercise.exerciseName}”？已记录的组将不计入完成结果。`)) return;
    const operationId = crypto.randomUUID();
    await mutateSession(
      {
        kind: "remove-exercise",
        operationId,
        sessionExerciseId: exercise.id,
        request: {
          method: "DELETE",
          path: `/api/workout-sessions/${session.id}/exercises/${exercise.id}`,
          body: JSON.stringify({ operationId, version: session.version }),
        },
      },
      "动作已从本次训练移除。",
    );
  }

  async function skipSessionExercise(exercise: WorkoutSession["exercises"][number]) {
    if (!session) return;
    await runMutation(() => apiRequest(`/api/workout-sessions/${session.id}/exercises/${exercise.id}/skip`, { method: "POST", body: JSON.stringify({ version: session.version }) }), "动作已跳过。");
  }

  async function reorderSessionExercises(exerciseIds: string[]) {
    if (!session) return;
    const operationId = crypto.randomUUID();
    await mutateSession(
      {
        kind: "reorder-exercises",
        operationId,
        exerciseIds,
        request: {
          method: "PUT",
          path: `/api/workout-sessions/${session.id}/exercises/order`,
          body: JSON.stringify({ exerciseIds, operationId, version: session.version }),
        },
      },
      "动作顺序已更新。",
    );
  }

  async function pauseWorkout() {
    if (!session) return;
    await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}/pause`, { method: "POST", body: JSON.stringify({ version: session.version }) }),
      "训练已挂起。",
    );
  }

  async function resumeWorkout() {
    if (!session) return;
    await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}/resume`, { method: "POST", body: JSON.stringify({ version: session.version }) }),
      "训练已继续。",
    );
  }

  async function completeWorkout() {
    if (!session) return;
    const result = await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}/complete`, { method: "POST", body: JSON.stringify({ version: session.version }) }),
      "训练已完成。",
    );
    if (result !== undefined) {
      await clearWorkoutSessionDraft(user.id);
      setView("history");
    }
  }

  async function saveSettings(nextSettings: { timeZone: string; weightUnit: "kg" | "lb" }) { await runMutation(() => apiRequest("/api/settings", { method: "PATCH", body: JSON.stringify(nextSettings) }), "设置已保存。"); }
  async function saveTelemetryPreference(enabled: boolean) {
    setBusy(true);
    try { await apiRequest<{ telemetryEnabled: boolean }>("/api/privacy", { method: "PATCH", body: JSON.stringify({ telemetryEnabled: enabled }) }); setTelemetryEnabled(enabled); setNotice(enabled ? "最小遥测已开启。" : "最小遥测已关闭，不会再收集新的遥测。 "); } catch (error) { setNotice(errorText(error)); } finally { setBusy(false); }
  }
  async function deletionSummary() { try { return (await apiRequest<{ summary: { plans: number; workoutDays: number; plannedExercises: number; exercises: number; workoutSessions: number; sessionExercises: number; setResults: number; telemetryEvents: number } }>("/api/account", { cache: "no-store" })).summary; } catch (error) { setNotice(errorText(error)); return undefined; } }
  async function exportBackup() {
    await runMutation(async () => {
      const backup = await apiRequest<{ backup: unknown }>("/api/backup", { cache: "no-store" });
      const href = URL.createObjectURL(new Blob([JSON.stringify(backup.backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = href; link.download = "cwfitness-backup.json"; link.click(); URL.revokeObjectURL(href);
    }, "JSON 备份已导出。");
  }
  async function previewRestore(backup: unknown) {
    try { const result = await apiRequest<{ summary: { plans: number; workoutDays: number; plannedExercises: number; exercises: number; workoutSessions: number; sessionExercises: number; setResults: number } }>("/api/backup/restore", { method: "POST", body: JSON.stringify({ backup }) }); return result.summary; } catch (error) { setNotice(errorText(error)); return undefined; }
  }
  async function restoreBackup(backup: unknown) {
    const result = await runMutation(() => apiRequest("/api/backup/restore", { method: "POST", body: JSON.stringify({ backup, confirmation: "RESTORE" }) }), "备份已恢复，所有设备会重新加载数据。");
    if (result !== undefined) { await clearWorkoutSessionDraft(user.id); new BroadcastChannel("cwfitness-backup").postMessage("restored"); setView("today"); }
  }
  async function deleteAccount() { setBusy(true); try { await apiRequest("/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE" }) }); await clearWorkoutSessionDraft(user.id); onAccountDeleted(); } catch (error) { setNotice(errorText(error)); } finally { setBusy(false); } }

  async function abandonWorkout() {
    if (!session) return;
    const result = await runMutation(() => apiRequest(`/api/workout-sessions/${session.id}/abandon`, { method: "POST", body: JSON.stringify({ version: session.version }) }), "训练已放弃，不计入进展。");
    if (result !== undefined) {
      await clearWorkoutSessionDraft(user.id);
      setView("today");
    }
  }

  async function correctHistoricalSet(session: WorkoutHistorySession, exercise: WorkoutSession["exercises"][number], setIndex: number, input: { actualValue: number; actualWeight?: number } | null) {
    const payload = input === null ? { skipped: true } : { actualValue: input.actualValue, ...(exercise.resistanceType === "WEIGHTED" ? { actualWeight: input.actualWeight, weightUnit: settings.weightUnit } : {}) };
    await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}/exercises/${exercise.id}/sets/${setIndex}`, { method: "PUT", body: JSON.stringify({ ...payload, version: session.version }) }),
      `第 ${setIndex} 组历史记录已修正。`,
    );
  }

  async function deleteHistoricalSession(session: WorkoutHistorySession) {
    if (!window.confirm(`永久删除“${session.workoutDayName}”这场完成训练？所有记录与进展贡献都会移除。`)) return;
    if (!window.confirm("再次确认：此操作不可恢复。")) return;
    await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}`, { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE", version: session.version }) }),
      "完成训练已永久删除。",
    );
  }

  async function takeOverSession() {
    if (!session) return;
    const result = await runMutation(
      () => apiRequest(`/api/workout-sessions/${session.id}/takeover`, { method: "POST", body: JSON.stringify({ version: session.version }) }),
      "已在此设备接管训练。",
    );
    if (result !== undefined) setView("training");
  }

  const allDays = plans.flatMap((plan) => plan.workoutDays.map((day) => ({ plan, day })));
  const suggested = allDays.find(({ day }) => day.suggestedWeekday === new Date().getDay())
    ?? allDays.find(({ day }) => day.plannedExercises.length > 0)
    ?? allDays[0]
    ?? null;
  const canEditSession = session?.editingDeviceId === deviceId;
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: settings.timeZone });
  const todayTrainingSeconds = dailyTrainingTime(workoutSessions, todayDate);
  const suggestion = progress.find((item) => item.suggestion)?.suggestion;

  return (
    <main className="workspace-shell">
      <div className="workspace-frame">
        <header className="workspace-topbar">
          <div className="workspace-brand">
            <span className="brand-mark" aria-hidden="true" />
            <div><strong>CwFitness</strong><span>{user.email}</span></div>
          </div>
          <nav className="workspace-nav" aria-label="主要导航">
            <button type="button" aria-current={view === "today" ? "page" : undefined} onClick={() => setView("today")}>今日</button>
            <button type="button" disabled={offline} aria-current={view === "plans" ? "page" : undefined} onClick={() => setView("plans")}>计划</button>
            <button type="button" disabled={offline} aria-current={view === "exercises" ? "page" : undefined} onClick={() => setView("exercises")}>动作</button>
            <button type="button" disabled={offline} aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}>历史</button>
            <button type="button" disabled={offline} aria-current={view === "progress" ? "page" : undefined} onClick={() => setView("progress")}>进展</button>
            <button type="button" disabled={offline} aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>设置</button>
            {session && <button type="button" aria-current={view === "training" ? "page" : undefined} onClick={() => setView("training")}>训练</button>}
          </nav>
          <div className="workspace-account">
            <span>{user.name}</span>
            <button className="action-button quiet" type="button" disabled={busy} onClick={onSignOut}>退出</button>
          </div>
        </header>

        {notice && <p className={`workspace-notice ${notice.includes("失败") ? "error" : ""}`} role="status">{notice}</p>}
        {pendingSync > 0 && <p className="workspace-notice recovery" role="status">{pendingSync} 项训练记录正在等待同步。</p>}
        {syncError && (
          <div className="workspace-notice error" role="alert">
            <span>{syncError}</span>
            <button className="text-button" type="button" onClick={() => void loadData()}>重试同步</button>
          </div>
        )}
        {conflict && (
          <div className="workspace-notice error" role="alert">
            <span>{conflict.message}。请刷新后再编辑。</span>
            <button className="text-button" type="button" onClick={() => void loadData()}>刷新最新数据</button>
          </div>
        )}

        <div className="workspace-body">
          {loading ? <p className="loading-state">正在加载训练空间…</p> : (
            <>
              {view === "today" && (
                <section className="workspace-section" aria-labelledby="today-title">
                  <header className="section-heading">
                    <div>
                      <p className="section-kicker">今日训练</p>
                      <h1 id="today-title">{session ? "有一场训练正在进行。" : "从建议训练日开始。"}</h1>
                    </div>
                    <p>{session ? "目标已经锁定，可以继续记录。" : "也可以进入计划页选择任意训练日。"}</p>
                  </header>

                  <div className="today-layout">
                    <article className="today-primary">
                      {session ? (
                        <>
                          <p className="section-kicker">{session.status === "PAUSED" ? "已挂起" : "进行中"}</p>
                          <h2>{session.exercises.filter((exercise) => exercise.removedAt === null).length} 个动作等待记录</h2>
                          <p>{session.localStartDate} 开始 · {session.status === "PAUSED" ? "训练时间已冻结" : "训练时间正在累计"}</p>
                          <button className="action-button primary large" type="button" onClick={() => setView("training")}>继续进入训练</button>
                        </>
                      ) : suggested ? (
                        <>
                          <p className="section-kicker">{suggested.plan.name}</p>
                          <h2>{suggested.day.name}</h2>
                          <p>{suggested.day.plannedExercises.length > 0 ? `${suggested.day.plannedExercises.length} 个动作已安排` : "先为这个训练日添加动作"}</p>
                          <button className="action-button primary large" type="button" disabled={busy || suggested.day.plannedExercises.length === 0} onClick={() => startWorkout(suggested.day)}>开始训练</button>
                        </>
                      ) : (
                        <>
                          <p className="section-kicker">准备开始</p>
                          <h2>先建立动作与训练计划。</h2>
                          <p>动作定义记录方式，训练日负责安排组数和目标。</p>
                          <button className="action-button primary large" type="button" onClick={() => setView("exercises")}>创建第一个动作</button>
                        </>
                      )}
                    </article>
                    <div className="today-stats">
                      <div><span>训练计划</span><strong>{plans.length}</strong></div>
                      <div><span>动作</span><strong>{exercises.length}</strong></div>
                      <div><span>训练日</span><strong>{allDays.length}</strong></div>
                      <div><span>今日训练时间</span><strong>{Math.floor(todayTrainingSeconds / 60)} 分</strong></div>
                      <div><span>最近完成</span><strong>{workoutSessions[0]?.localStartDate ?? "—"}</strong></div>
                      {suggestion && <div><span>进阶建议</span><strong>{suggestion}</strong></div>}
                    </div>
                  </div>
                </section>
              )}

              {view === "plans" && (
                <PlanEditor
                  plans={plans}
                  exercises={exercises}
                  selectedPlanId={selectedPlanId}
                  busy={busy}
                  progress={progress}
                  weightUnit={settings.weightUnit}
                  onSelectPlan={setSelectedPlanId}
                  onCreatePlan={createPlan}
                  onRenamePlan={renamePlan}
                  onUpdatePlanVisual={updatePlanVisual}
                  onSetArchived={setPlanArchived}
                  onCreateDay={createDay}
                  onUpdateDay={updateDay}
                  onDeleteDay={deleteDay}
                  onAddPlannedExercise={addPlannedExercise}
                  onUpdatePlannedExercise={updatePlannedExercise}
                  onDeletePlannedExercise={deletePlannedExercise}
                  onStartWorkout={startWorkout}
                />
              )}

              {view === "exercises" && (
                <ExerciseLibrary
                  exercises={exercises}
                  busy={busy}
                  onCreate={createExercise}
                  onRename={renameExercise}
                  onDelete={deleteExercise}
                />
              )}

              {view === "history" && <WorkoutHistory workoutSessions={workoutSessions} busy={busy} weightUnit={settings.weightUnit} onCorrectSet={correctHistoricalSet} onDeleteSession={deleteHistoricalSession} />}
              {view === "progress" && <ProgressView plans={plans} workoutSessions={workoutSessions} progress={progress} weightUnit={settings.weightUnit} />}
              {view === "settings" && <SettingsPanel settings={settings} busy={busy} telemetryEnabled={telemetryEnabled ?? true} onSave={saveSettings} onDelete={deleteAccount} onExport={exportBackup} onPreviewRestore={previewRestore} onRestore={restoreBackup} onTelemetryPreference={saveTelemetryPreference} onPrepareDelete={deletionSummary} />}

              {view === "training" && session && (
                <TrainingPanel
                  session={session}
                  exercises={exercises}
                  busy={busy}
                  weightUnit={settings.weightUnit}
                  canEdit={canEditSession}
                  offline={offline}
                  onRecordSet={recordSet}
                  onAddExercise={addSessionExercise}
                  onRemoveExercise={removeSessionExercise}
                  onSkipExercise={skipSessionExercise}
                  onPause={pauseWorkout}
                  onResume={resumeWorkout}
                  onComplete={completeWorkout}
                  onAbandon={abandonWorkout}
                  onTakeover={takeOverSession}
                  onReorder={reorderSessionExercises}
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
