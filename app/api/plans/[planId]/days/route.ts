import { getVerifiedSession } from "@/lib/auth";
import { requestedVersion, versionConflict } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: RouteContext<"/api/plans/[planId]/days">) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { planId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const suggestedWeekday = body?.suggestedWeekday ?? null;
  const version = requestedVersion(body?.version);
  if (!version || !name || name.length > 80 || (suggestedWeekday !== null && (!Number.isInteger(suggestedWeekday) || Number(suggestedWeekday) < 0 || Number(suggestedWeekday) > 6))) {
    return Response.json({ error: "Invalid Workout Day" }, { status: 400 });
  }

  const plan = await prisma.workoutPlan.findFirst({ where: { id: planId, userId: session.user.id }, select: { id: true, name: true, archivedAt: true, version: true } });
  if (!plan) return Response.json({ error: "Workout Plan not found" }, { status: 404 });
  if (plan.version !== version) return versionConflict(plan, "Workout Plan changed on another device");

  const workoutDay = await prisma.$transaction(async (tx) => {
    const lockedPlan = await tx.workoutPlan.updateMany({
      where: { id: plan.id, userId: session.user.id, version },
      data: { version: { increment: 1 } },
    });
    if (lockedPlan.count === 0) return null;
    return tx.workoutDay.create({
      data: { name, suggestedWeekday: suggestedWeekday as number | null, workoutPlanId: plan.id, position: await tx.workoutDay.count({ where: { workoutPlanId: plan.id } }) },
      select: { id: true, name: true, suggestedWeekday: true, version: true },
    });
  });
  if (!workoutDay) {
    const current = await prisma.workoutPlan.findUniqueOrThrow({
      where: { id: plan.id },
      select: { id: true, name: true, archivedAt: true, version: true },
    });
    return versionConflict(current, "Workout Plan changed on another device");
  }
  return Response.json({ workoutDay }, { status: 201 });
}
