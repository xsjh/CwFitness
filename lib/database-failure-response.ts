import { NextResponse } from "next/server";

import { probeTcpPort } from "@/lib/tcp-probe";

/**
 * Turns "the database is not running" into an answer the client can actually show.
 *
 * better-auth catches database failures itself and answers 500 with an empty body, so the error
 * never reaches this route as an exception — it has to be recognised in the response instead.
 * That empty 500 is exactly what the sign-in form turns into its generic "操作没有完成，请稍后重试。",
 * leaving no way to tell a stopped database from a wrong password.
 *
 * A bare 5xx is not proof on its own, so the port named by DATABASE_URL is probed before the
 * response is re-labelled. That keeps genuine bugs answering 500 while a stopped database answers
 * 503 with a cause the form can display.
 */
const UNREACHABLE_DATABASE_MESSAGE = "数据库未连接，请先启动本地数据库后重试。";

/** Extracts the host and port a URL would dial, or null when it cannot be parsed. */
export function databaseEndpoint(connectionString: string | undefined) {
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    const port = Number(url.port || "5432");
    if (!Number.isInteger(port) || port <= 0) return null;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

export async function withDatabaseFailureResponse(handler: () => Promise<Response>): Promise<Response> {
  const response = await handler();
  if (response.status < 500 || response.body !== null) return response;

  const endpoint = databaseEndpoint(process.env.DATABASE_URL);
  if (!endpoint || await probeTcpPort(endpoint.port, endpoint.host)) return response;

  return NextResponse.json(
    { message: UNREACHABLE_DATABASE_MESSAGE, code: "DATABASE_UNREACHABLE" },
    { status: 503 },
  );
}
