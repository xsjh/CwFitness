import { getVerifiedSession } from "@/lib/auth";
import { requestedVersion, versionConflict } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, context: { params: Promise<{ planId: string; dayId: string }> }) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { planId, dayId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ids = Array.isArray(body?.plannedExerciseIds) && body.plannedExerciseIds.every((id) => typeof id === "string") ? body.plannedExerciseIds : [];
  const version = requestedVersion(body?.version);
  const day = await prisma.workoutDay.findFirst({ where: { id: dayId, workoutPlanId: planId, workoutPlan: { userId: session.user.id } }, select: { id: true, version: true } });
  if (!day) return Response.json({ error: "Workout Day not found" }, { status: 404 });
  if (!version || day.version !== version) return versionConflict(day, "Workout Day changed on another device");
  const exercises = await prisma.plannedExercise.findMany({ where: { workoutDayId: dayId }, select: { id: true } });
  if (ids.length !== exercises.length || new Set(ids).size !== exercises.length || !exercises.every((exercise) => ids.includes(exercise.id))) return Response.json({ error: "A complete ordered Planned Exercise list is required" }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    const locked = await tx.workoutDay.updateMany({ where: { id: dayId, version }, data: { version: { increment: 1 } } });
    if (!locked.count) throw new Error("conflict");
    await Promise.all(ids.map((id, position) => tx.plannedExercise.update({ where: { id }, data: { position } })));
  });
  return Response.json({ plannedExerciseIds: ids });
}
