ALTER TABLE "workout_day" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "planned_exercise" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "workout_day_workoutPlanId_position_idx" ON "workout_day"("workoutPlanId", "position");
CREATE INDEX "planned_exercise_workoutDayId_position_idx" ON "planned_exercise"("workoutDayId", "position");
