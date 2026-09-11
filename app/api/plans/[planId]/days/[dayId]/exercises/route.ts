import { getVerifiedSession } from "@/lib/auth";
import { requestedVersion, versionConflict } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/plans/[planId]/days/[dayId]/exercises">,
) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, dayId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";
  const setCount = body?.setCount;
  const targetValue = body?.targetValue;
  const version = requestedVersion(body?.version);
  if (!version || !exerciseId || !positiveInteger(setCount) || !positiveInteger(targetValue)) {
    return Response.json({ error: "Invalid Planned Exercise targets" }, { status: 400 });
  }

  const [workoutDay, exercise] = await Promise.all([
    prisma.workoutDay.findFirst({
      where: { id: dayId, workoutPlanId: planId, workoutPlan: { userId: session.user.id } },
      select: { id: true, name: true, suggestedWeekday: true, version: true },
    }),
    prisma.exercise.findFirst({
      where: { id: exerciseId, userId: session.user.id },
      select: { id: true, resistanceType: true },
    }),
  ]);
  if (!workoutDay || !exercise) {
    return Response.json({ error: "Workout Day or Exercise not found" }, { status: 404 });
  }
  if (workoutDay.version !== version) return versionConflict(workoutDay, "Workout Day changed on another device");

  const weight = body?.weight;
  const weightUnit = body?.weightUnit;
  let weightGrams: number | null = null;
  if (exercise.resistanceType === "WEIGHTED") {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || (weightUnit !== "kg" && weightUnit !== "lb")) {
      return Response.json({ error: "Weighted Exercises require a positive kg or lb weight" }, { status: 400 });
    }
    weightGrams = Math.round(weight * (weightUnit === "kg" ? 1000 : 453.59237));
  } else if (weight !== undefined || weightUnit !== undefined) {
    return Response.json({ error: "Bodyweight Exercises cannot prescribe external weight" }, { status: 400 });
  }

  const plannedExercise = await prisma.$transaction(async (tx) => {
    const lockedDay = await tx.workoutDay.updateMany({
      where: { id: workoutDay.id, workoutPlanId: planId, workoutPlan: { userId: session.user.id }, version },
      data: { version: { increment: 1 } },
    });
    if (lockedDay.count === 0) return null;
    return tx.plannedExercise.create({
      data: {
        workoutDayId: workoutDay.id,
        exerciseId: exercise.id,
        setCount: Number(setCount),
        targetValue: Number(targetValue),
        weightGrams,
        position: await tx.plannedExercise.count({ where: { workoutDayId: workoutDay.id } }),
      },
      select: { id: true, exerciseId: true, setCount: true, targetValue: true, weightGrams: true, version: true },
    });
  });
  if (!plannedExercise) {
    const latest = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: workoutDay.id },
      select: { id: true, name: true, suggestedWeekday: true, version: true },
    });
    return versionConflict(latest, "Workout Day changed on another device");
  }
  return Response.json({ plannedExercise }, { status: 201 });
}


