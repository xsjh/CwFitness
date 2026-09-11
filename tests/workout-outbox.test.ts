import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applySessionMutation,
  clearWorkoutSessionOutbox,
  enqueueSessionMutation,
  loadWorkoutSessionDraft,
  queuedSessionMutations,
  replaySessionMutations,
  saveWorkoutSessionDraft,
  type NewSessionMutation,
} from "../app/workout-outbox";
import type { WorkoutSession } from "../app/workout-types";

function sessionFixture(): WorkoutSession {
  return {
    id: "session-1",
    status: "ACTIVE",
    timeZone: "UTC",
    localStartDate: "2026-09-10",
    startedAt: "2026-09-10T12:00:00.000Z",
    pausedAt: null,
    completedAt: null,
    modifiedAt: null,
    trainingTimeSeconds: null,
    version: 1,
    editingDeviceId: "device-1",
    exercises: [
      {
        id: "session-exercise-1",
        exerciseId: "exercise-1",
        plannedExerciseId: null,
        exerciseName: "Squat",
        resistanceType: "WEIGHTED",
        targetType: "REPETITIONS",
        setCount: 2,
        targetValue: 8,
        weightGrams: 60_000,
        position: 0,
        source: "PLANNED",
        removedAt: null,
        setResults: [],
      },
      {
        id: "session-exercise-2",
        exerciseId: "exercise-2",
        plannedExerciseId: null,
        exerciseName: "Plank",
        resistanceType: "BODYWEIGHT",
        targetType: "DURATION",
        setCount: 1,
        targetValue: 30,
        weightGrams: null,
        position: 1,
        source: "PLANNED",
        removedAt: null,
        setResults: [],
      },
    ],
  };
}

function queuedMutation(operationId: string): NewSessionMutation {
  return {
    kind: "set",
    operationId,
    sessionExerciseId: "session-exercise-1",
    setIndex: 1,
    result: { actualValue: 8, actualWeightGrams: 60_000, skipped: false },
    request: {
      method: "PUT",
      path: "/api/workout-sessions/session-1/exercises/session-exercise-1/sets/1",
      body: JSON.stringify({ actualValue: 8, version: 1 }),
    },
  };
}

beforeEach(async () => {
  await clearWorkoutSessionOutbox();
});

describe("workout session outbox", () => {
  it("applies recorded and skipped sets to the local Session", () => {
    const recorded = applySessionMutation(sessionFixture(), {
      kind: "set",
      operationId: "record-set",
      sessionExerciseId: "session-exercise-1",
      setIndex: 1,
      result: { actualValue: 10, actualWeightGrams: 65_000, skipped: false },
    });
    const skipped = applySessionMutation(recorded, {
      kind: "set",
      operationId: "skip-set",
      sessionExerciseId: "session-exercise-1",
      setIndex: 2,
      result: { actualValue: null, actualWeightGrams: null, skipped: true },
    });

    expect(skipped.exercises[0].setResults).toEqual([
      { setIndex: 1, actualValue: 10, actualWeightGrams: 65_000, skipped: false },
      { setIndex: 2, actualValue: null, actualWeightGrams: null, skipped: true },
    ]);
    expect(skipped.version).toBe(1);
  });

  it("applies added, removed, and reordered Exercises locally", () => {
    const added = applySessionMutation(sessionFixture(), {
      kind: "add-exercise",
      operationId: "add-exercise",
      exercise: {
        id: "local-exercise",
        exerciseId: "exercise-3",
        plannedExerciseId: null,
        exerciseName: "Row",
        resistanceType: "BODYWEIGHT",
        targetType: "REPETITIONS",
        setCount: 1,
        targetValue: 12,
        weightGrams: null,
        position: 2,
        source: "ADDED",
        removedAt: null,
        setResults: [],
      },
    });
    const removed = applySessionMutation(added, {
      kind: "remove-exercise",
      operationId: "remove-exercise",
      sessionExerciseId: "session-exercise-2",
    });
    const reordered = applySessionMutation(removed, {
      kind: "reorder-exercises",
      operationId: "reorder",
      exerciseIds: ["local-exercise", "session-exercise-1"],
    });

    expect(reordered.exercises.map((exercise) => exercise.id)).toEqual([
      "local-exercise",
      "session-exercise-1",
      "session-exercise-2",
    ]);
    expect(reordered.exercises[2].removedAt).not.toBeNull();
    expect(reordered.version).toBe(4);
  });

  it("recovers a saved Session draft after reopening storage", async () => {
    const draft = {
      session: sessionFixture(),
      exercises: [],
      settings: { timeZone: "UTC", weightUnit: "kg" as const },
    };

    await saveWorkoutSessionDraft("user-1", draft);
    expect(await loadWorkoutSessionDraft("user-1")).toEqual(draft);
    expect(await loadWorkoutSessionDraft("user-2")).toBeNull();
    await clearWorkoutSessionOutbox();
    expect(await loadWorkoutSessionDraft("user-1")).toBeNull();
  });

  it("replays queued mutations in order and preserves the failed tail", async () => {
    await enqueueSessionMutation("user-1", queuedMutation("one"));
    await enqueueSessionMutation("user-1", queuedMutation("two"));
    await enqueueSessionMutation("user-1", queuedMutation("three"));
    await enqueueSessionMutation("user-2", queuedMutation("other-user"));

    const attempted: string[] = [];
    const failed = await replaySessionMutations("user-1", async (mutation) => {
      attempted.push(mutation.operationId);
      if (mutation.operationId === "two") throw new Error("offline");
    });

    expect(attempted).toEqual(["one", "two"]);
    expect(failed.ok).toBe(false);
    expect((await queuedSessionMutations("user-1")).map((mutation) => mutation.operationId)).toEqual(["two", "three"]);
    expect((await queuedSessionMutations("user-2")).map((mutation) => mutation.operationId)).toEqual(["other-user"]);

    const replay = vi.fn().mockResolvedValue(undefined);
    const recovered = await replaySessionMutations("user-1", replay);
    expect(recovered.ok).toBe(true);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(await queuedSessionMutations("user-1")).toEqual([]);
  });
});
