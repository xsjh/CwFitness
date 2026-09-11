import { getVerifiedSession } from "@/lib/auth";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, exercises, plans, workoutSessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { timeZone: true, weightUnit: true } }),
    prisma.exercise.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } }),
    prisma.workoutPlan.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { workoutDays: { orderBy: { position: "asc" }, include: { plannedExercises: { orderBy: { position: "asc" } } } } } }),
    prisma.workoutSession.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { exercises: { orderBy: { position: "asc" }, include: { setResults: { orderBy: { setIndex: "asc" } } } } } }),
  ]);
  return Response.json({ backup: { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings, exercises, plans, workoutSessions } }, { headers: { "content-disposition": `attachment; filename="cwfitness-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}
