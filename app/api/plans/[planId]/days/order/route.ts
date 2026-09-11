import { getVerifiedSession } from "@/lib/auth";
import { requestedVersion, versionConflict } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, context: { params: Promise<{ planId: string }> }) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { planId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const dayIds = Array.isArray(body?.dayIds) && body.dayIds.every((id) => typeof id === "string") ? body.dayIds : [];
  const version = requestedVersion(body?.version);
  const plan = await prisma.workoutPlan.findFirst({ where: { id: planId, userId: session.user.id }, select: { id: true, version: true } });
  if (!plan) return Response.json({ error: "Workout Plan not found" }, { status: 404 });
  if (!version || plan.version !== version) return versionConflict(plan, "Workout Plan changed on another device");
  const days = await prisma.workoutDay.findMany({ where: { workoutPlanId: planId }, select: { id: true } });
  if (dayIds.length !== days.length || new Set(dayIds).size !== days.length || !days.every((day) => dayIds.includes(day.id))) return Response.json({ error: "A complete ordered Workout Day list is required" }, { status: 400 });
  const updated = await prisma.$transaction(async (tx) => {
    const locked = await tx.workoutPlan.updateMany({ where: { id: planId, userId: session.user.id, version }, data: { version: { increment: 1 } } });
    if (locked.count === 0) return false;
    await Promise.all(dayIds.map((id, position) => tx.workoutDay.update({ where: { id }, data: { position } })));
    return true;
  });
  if (!updated) return versionConflict(plan, "Workout Plan changed on another device");
  return Response.json({ dayIds });
}
