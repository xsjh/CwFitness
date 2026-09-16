export type ResistanceType = "WEIGHTED" | "BODYWEIGHT";
export type TargetType = "REPETITIONS" | "DURATION";

export type Exercise = {
  id: string;
  name: string;
  resistanceType: ResistanceType;
  targetType: TargetType;
  version: number;
};

export type PlannedExercise = {
  id: string;
  exerciseId: string;
  setCount: number;
  targetValue: number;
  weightGrams: number | null;
  version: number;
  position: number;
  exercise: Exercise;
};

export type WorkoutDay = {
  id: string;
  name: string;
  suggestedWeekday: number | null;
  version: number;
  position: number;
  plannedExercises: PlannedExercise[];
};

export type Plan = {
  id: string;
  name: string;
  version: number;
  archivedAt: string | null;
  accentColor: string;
  coverKey: string;
  workoutDays: WorkoutDay[];
};

export type SetResult = {
  setIndex: number;
  actualValue: number | null;
  actualWeightGrams: number | null;
  skipped: boolean;
};

export type SessionExercise = {
  id: string;
  exerciseId: string;
  plannedExerciseId: string | null;
  exerciseName: string;
  resistanceType: ResistanceType;
  targetType: TargetType;
  setCount: number;
  targetValue: number;
  weightGrams: number | null;
  position: number;
  source: "PLANNED" | "ADDED";
  removedAt: string | null;
  setResults: SetResult[];
};

export type WorkoutSession = {
  id: string;
  status: "ACTIVE" | "PAUSED";
  timeZone: string;
  localStartDate: string;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  modifiedAt: string | null;
  trainingTimeSeconds: number | null;
  version: number;
  editingDeviceId: string | null;
  exercises: SessionExercise[];
};

export type ExerciseResult = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  achievementRate: number;
  excessTargetValue: number;
  excessWeightGrams: number;
};

export type WorkoutHistorySession = Omit<WorkoutSession, "status"> & {
  status: "COMPLETED";
  workoutPlanId: string;
  workoutPlanName: string;
  workoutDayName: string;
  exerciseResults: ExerciseResult[];
};

export type ExerciseProgress = { workoutPlanId: string; plannedExerciseId: string; exerciseId: string; recent: Array<{ date: string; achievementRate: number; excessTargetValue: number; excessWeightGrams: number }>; progressionSuggestion: boolean; suggestion: string | null };

export type WorkspaceView = "today" | "plans" | "exercises" | "progress" | "training" | "history";
