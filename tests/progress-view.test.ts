import { describe, expect, test } from "vitest";
import { completedDays, dailyTrainingTime, dailyTrainingTimes, filterTrend } from "../app/progress-view";
import type { ProgressPoint } from "../app/progress-view";
import type { WorkoutHistorySession } from "../app/workout-types";

const points: ProgressPoint[] = [
  { date: "2026-09-10", value: 8, weightGrams: 100_000, achievementRate: 100 },
  { date: "2026-08-20", value: 7, weightGrams: 95_000, achievementRate: 88 },
  { date: "2026-06-01", value: 6, weightGrams: 90_000, achievementRate: 75 },
];

const session: WorkoutHistorySession = {
  id: "session-1", status: "COMPLETED", workoutPlanId: "plan-a", workoutPlanName: "Plan A", workoutDayName: "Day A",
  timeZone: "UTC", localStartDate: "2026-09-10", startedAt: "2026-09-10T10:00:00.000Z", pausedAt: null, completedAt: "2026-09-10T11:00:00.000Z", modifiedAt: null,
  trainingTimeSeconds: 3600, version: 1, editingDeviceId: null, exercises: [], exerciseResults: [],
};

describe("progress view data", () => {
  test("keeps latest-session and date-range trend filters distinct", () => {
    expect(filterTrend(points, "12")).toEqual(points);
    expect(filterTrend(points, "4w", new Date("2026-09-11T12:00:00.000Z"))).toEqual([points[0], points[1]]);
    expect(filterTrend(points, "12w", new Date("2026-09-11T12:00:00.000Z"))).toEqual([points[0], points[1]]);
  });

  test("marks a completed date once even when it has multiple sessions", () => {
    expect(completedDays([session, { ...session, id: "session-2" }])).toEqual(new Set(["2026-09-10"]));
  });

  test("sums daily Training Time across plans without calculating an achievement average", () => {
    expect(dailyTrainingTime([
      session,
      { ...session, id: "session-2", workoutPlanId: "plan-b", trainingTimeSeconds: 900 },
    ], "2026-09-10")).toBe(4500);
  });

  test("returns one daily Training Time total for every completed date in the four-week view", () => {
    expect(dailyTrainingTimes([
      session,
      { ...session, id: "session-2", localStartDate: "2026-09-09", trainingTimeSeconds: 900 },
      { ...session, id: "session-3", localStartDate: "2026-08-01", trainingTimeSeconds: 600 },
    ], new Date("2026-09-11T12:00:00.000Z"))).toEqual([
      { date: "2026-09-09", seconds: 900 },
      { date: "2026-09-10", seconds: 3600 },
    ]);
  });
});
