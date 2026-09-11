import { getVerifiedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const categories = new Set(["page_visit", "feature_operation", "sync_failure", "sanitized_error"]);

export async function GET(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const events = await prisma.telemetryEvent.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, select: { category: true, createdAt: true } });
  return Response.json({ events });
}

export async function POST(request: Request) {
  const session = await getVerifiedSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { category?: unknown } | null;
  if (typeof body?.category !== "string" || !categories.has(body.category)) return Response.json({ error: "Invalid telemetry category" }, { status: 400 });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { telemetryEnabled: true } });
  if (user.telemetryEnabled) await prisma.telemetryEvent.create({ data: { userId: session.user.id, category: body.category } });
  return new Response(null, { status: 204 });
}
