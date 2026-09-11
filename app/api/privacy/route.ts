import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { telemetryEnabled: true } });
  return Response.json(user);
}

export async function PATCH(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { telemetryEnabled?: unknown } | null;
  if (typeof body?.telemetryEnabled !== "boolean") return Response.json({ error: "Invalid telemetry preference" }, { status: 400 });
  const user = await prisma.user.update({ where: { id: session.user.id }, data: { telemetryEnabled: body.telemetryEnabled }, select: { telemetryEnabled: true } });
  return Response.json(user);
}
