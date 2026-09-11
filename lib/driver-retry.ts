// "bind message supplies N parameters, but prepared statement "" requires 0" (PostgreSQL
// 08P01) surfaces from the pg driver when two queries are pipelined onto the same pooled
// connection during dev-server reloads. The Bind never completes, so the statement did not
// run and replaying it once is safe. Without this retry a transient driver hiccup escapes as
// a 500 and, for example, blocks starting a Workout Session after the row was already created.
const TRANSIENT_DRIVER_FRAGMENT = "bind message supplies";

export function isTransientDriverError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes(TRANSIENT_DRIVER_FRAGMENT);
}

export async function retryTransientDriverError<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDriverError(error)) throw error;
    }
  }
}
