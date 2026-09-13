import { NextResponse } from "next/server";

import { isDatabaseUnreachableError } from "@/lib/driver-retry";

/**
 * Turns "the database is not running" into an answer the client can actually show.
 *
 * Without this the error escapes the route uncaught, Next.js answers with a bare 500 and an empty
 * body, and the sign-in form — which only reads `message` from a JSON body — falls back to its
 * generic "操作没有完成，请稍后重试。". The person then has no way to tell a stopped database from a
 * wrong password. Answering 503 with an explicit message keeps the cause visible.
 *
 * Anything that is not a database-unreachable failure is re-thrown unchanged, so genuine bugs keep
 * their stack and their 500.
 */
export async function withDatabaseFailureResponse(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (!isDatabaseUnreachableError(error)) throw error;
    return NextResponse.json(
      {
        message: "数据库未连接，请先启动本地数据库后重试。",
        code: "DATABASE_UNREACHABLE",
      },
      { status: 503 },
    );
  }
}
