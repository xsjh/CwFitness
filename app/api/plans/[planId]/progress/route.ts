import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scoreExercises } from "@/lib/workout-session-domain";

function sameTarget(left: { setCount: number; targetValue: number; weightGrams: number | null }, right: { setCount: number; targetValue: number; weightGrams: number | null }) {
  return left.setCount === right.setCount && left.targetValue === right.targetValue && left.weightGrams === right.weightGrams;
}

function suggestionFor(resistanceType: "WEIGHTED" | "BODYWEIGHT", targetType: "REPETITIONS" | "DURATION") {
  if (resistanceType === "WEIGHTED" && targetType === "REPETITIONS") return "建议增加重量";
  if (resistanceType === "BODYWEIGHT" && targetType === "REPETITIONS") return "建议增加次数";
  if (resistanceType === "BODYWEIGHT") return "建议增加时长";
  return "建议增加重量或时长";
}

export async function GET(request: Request, context: { params: Promise<{ planId: string }> }) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { planId } = await context.params;
  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId: session.user.id },
    select: { workoutDays: { select: { plannedExercises: { select: { id: true, exerciseId: true, setCount: true, targetValue: true, weightGrams: true, exercise: { select: { resistanceType: true, targetType: true } } } } } } },
  });
  if (!plan) return Response.json({ error: "Workout Plan not found" }, { status: 404 });
  const plannedExercises = plan.workoutDays.flatMap((day) => day.plannedExercises);
  const histories = await prisma.sessionExercise.findMany({
    where: { plannedExerciseId: { in: plannedExercises.map((planned) => planned.id) }, removedAt: null, workoutSession: { userId: session.user.id, workoutPlanId: planId, status: "COMPLETED" } },
    orderBy: { workoutSession: { completedAt: "desc" } },
    include: { exercise: { select: { name: true } }, setResults: true, workoutSession: { select: { localStartDate: true } } },
  });
  const progress = plannedExercises.map((planned) => {
    const items = histories.filter((history) => history.plannedExerciseId === planned.id);
    const streak = items.slice(0, 3);
    const recent = items.slice(0, 12).map((history) => ({ date: history.workoutSession.localStartDate, ...scoreExercises([history])[0] }));
    const qualifies = streak.length === 3
      && streak.every((item) => scoreExercises([item])[0].achievementRate === 100)
      && streak.filter((item) => { const score = scoreExercises([item])[0]; return score.excessTargetValue > 0 || score.excessWeightGrams > 0; }).length >= 2
      && streak.every((item) => sameTarget(item, planned));
    return { workoutPlanId: planId, plannedExerciseId: planned.id, exerciseId: planned.exerciseId, recent, progressionSuggestion: qualifies, suggestion: qualifies ? suggestionFor(planned.exercise.resistanceType, planned.exercise.targetType) : null };
  }).filter((entry) => entry.recent.length > 0);
  return Response.json({ progress });
}
