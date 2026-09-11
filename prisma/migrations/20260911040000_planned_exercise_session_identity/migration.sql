ALTER TABLE "session_exercise" ADD COLUMN "plannedExerciseId" TEXT;

CREATE INDEX "session_exercise_plannedExerciseId_idx" ON "session_exercise"("plannedExerciseId");

ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_plannedExerciseId_fkey" FOREIGN KEY ("plannedExerciseId") REFERENCES "planned_exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
