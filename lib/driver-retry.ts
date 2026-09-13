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
