import { getVerifiedSession } from "@/lib/auth";
import { backupSummary, parseFitnessBackup } from "@/lib/backup";
import { prisma } from "@/lib/prisma";

const asDate = (value: unknown) => new Date(value as string);
const nullableDate = (value: unknown) => value === null ? null : asDate(value);

export async function POST(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { backup?: unknown; confirmation?: unknown } | null;
  const backup = parseFitnessBackup(body?.backup);
  if (!backup) return Response.json({ error: "备份格式、版本或关联数据无效。" }, { status: 400 });
  const summary = backupSummary(backup);
  if (body?.confirmation !== "RESTORE") return Response.json({ summary, requiresConfirmation: true });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workoutSession.deleteMany({ where: { userId: session.user.id } });
      await tx.workoutPlan.deleteMany({ where: { userId: session.user.id } });
      await tx.exercise.deleteMany({ where: { userId: session.user.id } });
      await tx.user.update({ where: { id: session.user.id }, data: { timeZone: backup.settings.timeZone, weightUnit: backup.settings.weightUnit, dataVersion: { increment: 1 } } });
      await tx.exercise.createMany({ data: backup.exercises.map((item) => ({ id: item.id as string, userId: session.user.id, name: item.name as string, resistanceType: item.resistanceType as "WEIGHTED" | "BODYWEIGHT", targetType: item.targetType as "REPETITIONS" | "DURATION", version: item.version as number, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
      await tx.workoutPlan.createMany({ data: backup.plans.map((item) => ({ id: item.id as string, userId: session.user.id, name: item.name as string, version: item.version as number, archivedAt: nullableDate(item.archivedAt), accentColor: item.accentColor as string, coverKey: item.coverKey as string, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
      const days: Record<string, unknown>[] = backup.plans.flatMap((plan) => (plan.workoutDays as Record<string, unknown>[]).map((item) => ({ ...item, workoutPlanId: plan.id as string })));
      await tx.workoutDay.createMany({ data: days.map((item) => ({ id: item.id as string, workoutPlanId: item.workoutPlanId as string, name: item.name as string, suggestedWeekday: item.suggestedWeekday as number | null, position: item.position as number, version: item.version as number, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
      const planned: Record<string, unknown>[] = days.flatMap((day) => (day.plannedExercises as Record<string, unknown>[]).map((item) => ({ ...item, workoutDayId: day.id as string })));
      await tx.plannedExercise.createMany({ data: planned.map((item) => ({ id: item.id as string, workoutDayId: item.workoutDayId as string, exerciseId: item.exerciseId as string, setCount: item.setCount as number, targetValue: item.targetValue as number, weightGrams: item.weightGrams as number | null, position: item.position as number, version: item.version as number, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
      await tx.workoutSession.createMany({ data: backup.workoutSessions.map((item) => ({ id: item.id as string, userId: session.user.id, workoutPlanId: item.workoutPlanId as string, workoutDayId: item.workoutDayId as string | null, workoutPlanName: item.workoutPlanName as string, workoutDayName: item.workoutDayName as string, timeZone: item.timeZone as string, localStartDate: item.localStartDate as string, status: item.status as "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED", startedAt: asDate(item.startedAt), pausedAt: nullableDate(item.pausedAt), pausedDurationMs: item.pausedDurationMs as number, activeDurationMs: item.activeDurationMs as number, completedAt: nullableDate(item.completedAt), modifiedAt: nullableDate(item.modifiedAt), trainingTimeSeconds: item.trainingTimeSeconds as number | null, lastHeartbeatAt: nullableDate(item.lastHeartbeatAt), version: item.version as number, editingDeviceId: null, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
      const sessionExercises: Record<string, unknown>[] = backup.workoutSessions.flatMap((sessionItem) => (sessionItem.exercises as Record<string, unknown>[]).map((item) => ({ ...item, workoutSessionId: sessionItem.id as string })));
      await tx.sessionExercise.createMany({ data: sessionExercises.map((item) => ({ id: item.id as string, workoutSessionId: item.workoutSessionId as string, exerciseId: item.exerciseId as string, exerciseName: item.exerciseName as string, resistanceType: item.resistanceType as "WEIGHTED" | "BODYWEIGHT", targetType: item.targetType as "REPETITIONS" | "DURATION", setCount: item.setCount as number, targetValue: item.targetValue as number, weightGrams: item.weightGrams as number | null, position: item.position as number, source: item.source as "PLANNED" | "ADDED", plannedExerciseId: item.plannedExerciseId as string | null, removedAt: nullableDate(item.removedAt), createdAt: asDate(item.createdAt) })) });
      const results: Record<string, unknown>[] = sessionExercises.flatMap((exercise) => (exercise.setResults as Record<string, unknown>[]).map((item) => ({ ...item, sessionExerciseId: exercise.id as string })));
      await tx.sessionSetResult.createMany({ data: results.map((item) => ({ id: item.id as string, sessionExerciseId: item.sessionExerciseId as string, setIndex: item.setIndex as number, actualValue: item.actualValue as number | null, actualWeightGrams: item.actualWeightGrams as number | null, skipped: item.skipped as boolean, operationId: item.operationId as string | null, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt) })) });
    });
  } catch {
    return Response.json({ error: "恢复失败，原有数据未被更改。" }, { status: 400 });
  }
  return Response.json({ summary, restored: true, cacheInvalidated: true });
}
