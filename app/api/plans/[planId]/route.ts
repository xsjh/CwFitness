import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const accents = new Set(["sage", "slate", "clay", "ocean"]);
const covers = new Set(["strength", "endurance", "mobility", "balance"]);

export async function PATCH(request: Request, context: { params: Promise<{ planId: string }> }) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { planId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const archived = typeof body?.archived === "boolean" ? body.archived : undefined;
  const accentColor = typeof body?.accentColor === "string" ? body.accentColor : undefined;
  const coverKey = typeof body?.coverKey === "string" ? body.coverKey : undefined;
  const version = body?.version;
  if (!Number.isInteger(version) || Number(version) < 1 || (name !== undefined && (!name || name.length > 80)) || (accentColor !== undefined && !accents.has(accentColor)) || (coverKey !== undefined && !covers.has(coverKey)) || (name === undefined && archived === undefined && accentColor === undefined && coverKey === undefined)) {
    return Response.json({ error: "Plan name must contain 1 to 80 characters" }, { status: 400 });
  }

  const current = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId: session.user.id },
    select: { id: true, name: true, archivedAt: true, accentColor: true, coverKey: true, version: true },
  });
  if (!current) return Response.json({ error: "Workout Plan not found" }, { status: 404 });
  if (current.version !== version) {
    return Response.json({ error: "Workout Plan changed on another device", code: "VERSION_CONFLICT", current }, { status: 409 });
  }

  const result = await prisma.workoutPlan.updateMany({
    where: { id: planId, userId: session.user.id, version: Number(version) },
    data: {
      ...(name === undefined ? {} : { name }),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      ...(accentColor === undefined ? {} : { accentColor }),
      ...(coverKey === undefined ? {} : { coverKey }),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const latest = await prisma.workoutPlan.findUniqueOrThrow({
      where: { id: planId },
      select: { id: true, name: true, archivedAt: true, accentColor: true, coverKey: true, version: true },
    });
    return Response.json({ error: "Workout Plan changed on another device", code: "VERSION_CONFLICT", current: latest }, { status: 409 });
  }

  const plan = await prisma.workoutPlan.findUniqueOrThrow({
    where: { id: planId },
    select: { id: true, name: true, archivedAt: true, accentColor: true, coverKey: true, version: true },
  });
  return Response.json({ plan });
}
