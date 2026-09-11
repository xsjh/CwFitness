import { getVerifiedSession } from "@/lib/auth";
import { requestedVersion, versionConflict } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string; sessionExerciseId: string }> }) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId, sessionExerciseId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const version = requestedVersion(body?.version);
  if (!version) return Response.json({ error: "Version is required" }, { status: 400 });
  const exercise = await prisma.sessionExercise.findFirst({ where: { id: sessionExerciseId, workoutSessionId: sessionId, removedAt: null, workoutSession: { userId: session.user.id, status: "ACTIVE", editingDeviceId: session.session.id } }, include: { workoutSession: { select: { version: true } } } });
  if (!exercise) return Response.json({ error: "Session Exercise not found" }, { status: 404 });
  if (exercise.workoutSession.version !== version) return versionConflict(exercise.workoutSession, "Workout Session changed on another device");
  await prisma.$transaction(async (tx) => {
    await tx.workoutSession.update({ where: { id: sessionId }, data: { version: { increment: 1 } } });
    await Promise.all(Array.from({ length: exercise.setCount }, (_, index) => tx.sessionSetResult.upsert({ where: { sessionExerciseId_setIndex: { sessionExerciseId, setIndex: index + 1 } }, create: { sessionExerciseId, setIndex: index + 1, actualValue: null, actualWeightGrams: null, skipped: true }, update: { actualValue: null, actualWeightGrams: null, skipped: true } })));
  });
  return Response.json({ skipped: true });
}
