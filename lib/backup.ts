export const BACKUP_SCHEMA_VERSION = 1;

type RecordValue = Record<string, unknown>;
export type BackupSummary = { plans: number; workoutDays: number; plannedExercises: number; exercises: number; workoutSessions: number; sessionExercises: number; setResults: number };

export type FitnessBackup = RecordValue & {
  schemaVersion: 1;
  exportedAt: string;
  settings: { timeZone: string; weightUnit: "kg" | "lb" };
  plans: RecordValue[];
  exercises: RecordValue[];
  workoutSessions: RecordValue[];
};

function object(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : null;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function integer(value: unknown, minimum = 0) { return typeof value === "number" && Number.isInteger(value) && value >= minimum; }
function optionalInteger(value: unknown, minimum = 0) { return value === null || integer(value, minimum); }
function date(value: unknown) { return text(value) && !Number.isNaN(Date.parse(value)); }
function enumValue(value: unknown, choices: readonly string[]) { return typeof value === "string" && choices.includes(value); }

function validBase(item: RecordValue) { return text(item.id) && integer(item.version, 1) && date(item.createdAt) && date(item.updatedAt); }
function unique(items: RecordValue[], seen: Set<string>) { return items.every((item) => text(item.id) && !seen.has(item.id as string) && (seen.add(item.id as string), true)); }

export function parseFitnessBackup(value: unknown): FitnessBackup | null {
  const backup = object(value);
  if (!backup || backup.schemaVersion !== BACKUP_SCHEMA_VERSION || !date(backup.exportedAt)) return null;
  const settings = object(backup.settings);
  const plans = Array.isArray(backup.plans) ? backup.plans.map(object) : null;
  const exercises = Array.isArray(backup.exercises) ? backup.exercises.map(object) : null;
  const workoutSessions = Array.isArray(backup.workoutSessions) ? backup.workoutSessions.map(object) : null;
  if (!settings || !plans || !exercises || !workoutSessions || plans.some((item) => !item) || exercises.some((item) => !item) || workoutSessions.some((item) => !item)) return null;
  if (!text(settings.timeZone) || !enumValue(settings.weightUnit, ["kg", "lb"])) return null;
  try { Intl.DateTimeFormat(undefined, { timeZone: settings.timeZone as string }); } catch { return null; }

  const ids = new Set<string>();
  if (!unique(exercises as RecordValue[], ids) || !unique(plans as RecordValue[], ids) || !unique(workoutSessions as RecordValue[], ids)) return null;
  const exerciseIds = new Set<string>();
  const planIds = new Set<string>();
  const dayIds = new Set<string>();
  const plannedIds = new Set<string>();
  const sessionIds = new Set<string>();
  const sessionExerciseIds = new Set<string>();

  for (const exercise of exercises as RecordValue[]) {
    if (!validBase(exercise) || !text(exercise.name) || !enumValue(exercise.resistanceType, ["WEIGHTED", "BODYWEIGHT"]) || !enumValue(exercise.targetType, ["REPETITIONS", "DURATION"])) return null;
    exerciseIds.add(exercise.id as string);
  }
  for (const plan of plans as RecordValue[]) {
    const days = Array.isArray(plan.workoutDays) ? plan.workoutDays.map(object) : null;
    if (!validBase(plan) || !text(plan.name) || !(plan.archivedAt === null || date(plan.archivedAt)) || !enumValue(plan.accentColor, ["sage", "slate", "clay", "ocean"]) || !enumValue(plan.coverKey, ["strength", "endurance", "mobility", "balance"]) || !days || days.some((item) => !item)) return null;
    planIds.add(plan.id as string);
    for (const day of days as RecordValue[]) {
      const planned = Array.isArray(day.plannedExercises) ? day.plannedExercises.map(object) : null;
      if (!validBase(day) || !text(day.name) || !integer(day.position) || !(day.suggestedWeekday === null || integer(day.suggestedWeekday, 0) && (day.suggestedWeekday as number) <= 6) || !planned || planned.some((item) => !item) || dayIds.has(day.id as string)) return null;
      dayIds.add(day.id as string);
      for (const item of planned as RecordValue[]) {
        if (!validBase(item) || !text(item.id) || !exerciseIds.has(item.exerciseId as string) || !integer(item.setCount, 1) || !integer(item.targetValue, 1) || !optionalInteger(item.weightGrams) || !integer(item.position) || plannedIds.has(item.id as string)) return null;
        plannedIds.add(item.id as string);
      }
    }
  }
  for (const session of workoutSessions as RecordValue[]) {
    const sessionExercises = Array.isArray(session.exercises) ? session.exercises.map(object) : null;
    if (!validBase(session) || !planIds.has(session.workoutPlanId as string) || !(session.workoutDayId === null || dayIds.has(session.workoutDayId as string)) || !text(session.workoutPlanName) || !text(session.workoutDayName) || !text(session.timeZone) || !text(session.localStartDate) || !enumValue(session.status, ["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]) || !date(session.startedAt) || !(session.pausedAt === null || date(session.pausedAt)) || !integer(session.pausedDurationMs) || !integer(session.activeDurationMs) || !(session.completedAt === null || date(session.completedAt)) || !(session.modifiedAt === null || date(session.modifiedAt)) || !optionalInteger(session.trainingTimeSeconds) || !(session.lastHeartbeatAt === null || date(session.lastHeartbeatAt)) || !sessionExercises || sessionExercises.some((item) => !item)) return null;
    sessionIds.add(session.id as string);
    for (const exercise of sessionExercises as RecordValue[]) {
      const results = Array.isArray(exercise.setResults) ? exercise.setResults.map(object) : null;
      if (!text(exercise.id) || !exerciseIds.has(exercise.exerciseId as string) || !text(exercise.exerciseName) || !enumValue(exercise.resistanceType, ["WEIGHTED", "BODYWEIGHT"]) || !enumValue(exercise.targetType, ["REPETITIONS", "DURATION"]) || !integer(exercise.setCount, 1) || !integer(exercise.targetValue, 1) || !optionalInteger(exercise.weightGrams) || !integer(exercise.position) || !enumValue(exercise.source, ["PLANNED", "ADDED"]) || !(exercise.plannedExerciseId === null || plannedIds.has(exercise.plannedExerciseId as string)) || !(exercise.removedAt === null || date(exercise.removedAt)) || !date(exercise.createdAt) || !results || results.some((item) => !item) || sessionExerciseIds.has(exercise.id as string)) return null;
      sessionExerciseIds.add(exercise.id as string);
      const setIndexes = new Set<number>();
      for (const result of results as RecordValue[]) {
        if (!text(result.id) || !date(result.createdAt) || !date(result.updatedAt) || !integer(result.setIndex, 1) || setIndexes.has(result.setIndex as number) || !optionalInteger(result.actualValue, 0) || !optionalInteger(result.actualWeightGrams, 0) || typeof result.skipped !== "boolean" || !(result.operationId === null || text(result.operationId))) return null;
        setIndexes.add(result.setIndex as number);
      }
    }
  }
  return backup as FitnessBackup;
}

export function backupSummary(backup: FitnessBackup): BackupSummary {
  const days = backup.plans.flatMap((plan) => plan.workoutDays as RecordValue[]);
  const planned = days.flatMap((day) => day.plannedExercises as RecordValue[]);
  const sessionExercises = backup.workoutSessions.flatMap((session) => session.exercises as RecordValue[]);
  return { plans: backup.plans.length, workoutDays: days.length, plannedExercises: planned.length, exercises: backup.exercises.length, workoutSessions: backup.workoutSessions.length, sessionExercises: sessionExercises.length, setResults: sessionExercises.reduce((total, exercise) => total + (exercise.setResults as unknown[]).length, 0) };
}
