// The local PostgreSQL used for development drops pooled connections under load, and the pg
// driver hands the next query to a socket that is already gone. Both shapes of that hiccup, and
// the pipelined-prepared-statement mismatch below, are reported before the statement reaches
// PostgreSQL, so replaying the call once is safe:
//
// - "bind message supplies N parameters, but prepared statement \"\" requires 0" (PostgreSQL
//   08P01) surfaces when two queries are pipelined onto the same pooled connection during
//   dev-server reloads. The Bind never completes, so the statement did not run.
// - "Server has closed the connection" (Prisma P1017) and "Can't reach database server"
//   (Prisma P1001) are reported while acquiring or writing to a connection. The server either
//   never received the statement or had already torn the session down, so a replay is the only
//   outcome that differs from failing the request outright.
//
// Without this retry a transient driver hiccup escapes as a 500 and, for example, blocks
// starting a Workout Session after the row was already created.
const TRANSIENT_DRIVER_CODES = new Set(["P1001", "P1017"]);

const TRANSIENT_DRIVER_FRAGMENTS = [
  "bind message supplies",
  "Server has closed the connection",
  "Can't reach database server",
];

// A dead connection is removed from the pool when its error is reported, so a short pause keeps
// the replay from racing that cleanup and landing on the same closed socket.
const RETRY_DELAY_MS = 50;

export function isTransientDriverError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && TRANSIENT_DRIVER_CODES.has(code)) return true;
  return typeof message === "string" && TRANSIENT_DRIVER_FRAGMENTS.some((fragment) => message.includes(fragment));
}

// "The database is not there" is a different situation from "this one connection hiccupped".
// A hiccup is worth replaying; an absent database is not, and it has to reach the caller as an
// explanation rather than a blank 500 — otherwise the sign-in form can only say "操作没有完成",
// which is what sent us chasing this in the first place. `ECONNREFUSED` is what the pg driver
// reports when the `prisma dev` instance behind DATABASE_URL is not running.
const UNREACHABLE_DATABASE_CODES = new Set(["P1001", "ECONNREFUSED"]);

const UNREACHABLE_DATABASE_FRAGMENTS = [
  "Can't reach database server",
  "ECONNREFUSED",
];

/**
 * Reports whether the failure means the database itself is unreachable, as opposed to a single
 * statement failing. Retrying cannot fix this, so callers should surface it instead of replaying.
 */
export function isDatabaseUnreachableError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && UNREACHABLE_DATABASE_CODES.has(code)) return true;
  // The pg driver nests the socket error, so the code that matters can be one level down.
  const cause = (error as { cause?: { code?: unknown } }).cause;
  if (typeof cause?.code === "string" && UNREACHABLE_DATABASE_CODES.has(cause.code)) return true;
  return typeof message === "string" && UNREACHABLE_DATABASE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

export async function retryTransientDriverError<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDriverError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
