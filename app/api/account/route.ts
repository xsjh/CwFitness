import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") return Response.json({ error: "Confirmation is required" }, { status: 400 });
  await prisma.user.delete({ where: { id: session.user.id } });
  return new Response(null, { status: 204 });
}

export async function GET(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const [plans, exercises, workoutSessions, telemetryEvents, workoutDays, plannedExercises, sessionExercises, setResults] = await Promise.all([
    prisma.workoutPlan.count({ where: { userId } }),
    prisma.exercise.count({ where: { userId } }),
    prisma.workoutSession.count({ where: { userId } }),
    prisma.telemetryEvent.count({ where: { userId } }),
    prisma.workoutDay.count({ where: { workoutPlan: { userId } } }),
    prisma.plannedExercise.count({ where: { workoutDay: { workoutPlan: { userId } } } }),
    prisma.sessionExercise.count({ where: { workoutSession: { userId } } }),
    prisma.sessionSetResult.count({ where: { sessionExercise: { workoutSession: { userId } } } }),
  ]);
  return Response.json({ summary: { plans, workoutDays, plannedExercises, exercises, workoutSessions, sessionExercises, setResults, telemetryEvents } });
}
