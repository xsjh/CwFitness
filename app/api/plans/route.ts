import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUser(request: Request) {
  return getVerifiedSession(request);
}

export async function GET(request: Request) {
  const session = await currentUser(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const plans = await prisma.workoutPlan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      version: true,
      archivedAt: true,
      workoutDays: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          suggestedWeekday: true,
          version: true,
          position: true,
          plannedExercises: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              exerciseId: true,
              setCount: true,
              targetValue: true,
              weightGrams: true,
              version: true,
              position: true,
              exercise: {
                select: {
                  id: true,
                  name: true,
                  resistanceType: true,
                  targetType: true,
                  version: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return Response.json({ plans });
}

export async function POST(request: Request) {
  const session = await currentUser(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const name =
    typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name || name.length > 80) {
    return Response.json({ error: "Plan name must contain 1 to 80 characters" }, { status: 400 });
  }

  const plan = await prisma.workoutPlan.create({
    data: { name, userId: session.user.id },
    select: { id: true, name: true, version: true, workoutDays: true },
  });

  return Response.json({ plan }, { status: 201 });
}
