import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withDatabaseFailureResponse } from "@/lib/database-failure-response";

const handler = toNextJsHandler(auth);

// When the local database is not running every one of these routes throws before it can answer,
// and the sign-in form can only report "操作没有完成". Wrapping them keeps the real cause visible.
export function GET(request: Request) {
  return withDatabaseFailureResponse(() => handler.GET(request));
}

export function POST(request: Request) {
  return withDatabaseFailureResponse(() => handler.POST(request));
}
