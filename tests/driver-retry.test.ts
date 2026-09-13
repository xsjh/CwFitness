import { describe, expect, it, vi } from "vitest";

import { isDatabaseUnreachableError, isTransientDriverError, retryTransientDriverError } from "../lib/driver-retry";

const transientMessage = 'Database error. Code: `08P01`. Message: `bind message supplies 4 parameters, but prepared statement "" requires 0`';
const closedConnection = Object.assign(new Error("Invalid `prisma.plannedExercise.count()` invocation in\n\nServer has closed the connection."), { code: "P1017" });
const unreachableServer = Object.assign(new Error("Invalid `prisma.user.findFirst()` invocation in\n\nCan't reach database server at 127.0.0.1:51214"), { code: "P1001" });

describe("driver retry", () => {
  it("recognises the PostgreSQL prepared-statement mismatch", () => {
    expect(isTransientDriverError(new Error(transientMessage))).toBe(true);
    expect(isTransientDriverError(new Error("Unique constraint failed on the fields: (`email`)"))).toBe(false);
    expect(isTransientDriverError("bind message supplies 4 parameters")).toBe(false);
    expect(isTransientDriverError(undefined)).toBe(false);
  });

  it("recognises a connection the local database closed, by code and by message", () => {
    expect(isTransientDriverError(closedConnection)).toBe(true);
    expect(isTransientDriverError(unreachableServer)).toBe(true);
    expect(isTransientDriverError({ code: "P1017" })).toBe(true);
    expect(isTransientDriverError(new Error("Server has closed the connection."))).toBe(true);
    expect(isTransientDriverError(new Error("Can't reach database server at 127.0.0.1:51214"))).toBe(true);
    // A code that says the statement ran, or was rejected by the database, must not be replayed.
    expect(isTransientDriverError(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))).toBe(false);
  });

  it("replays the operation once when the driver reports the transient error", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error(transientMessage))
      .mockResolvedValue("重新执行成功");

    await expect(retryTransientDriverError(operation)).resolves.toBe("重新执行成功");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("replays an operation whose pooled connection was already closed", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(closedConnection)
      .mockResolvedValue("重新执行成功");

    await expect(retryTransientDriverError(operation)).resolves.toBe("重新执行成功");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not replay other failures", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Unique constraint failed"));

    await expect(retryTransientDriverError(operation)).rejects.toThrow("Unique constraint failed");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up once the attempt budget is exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error(transientMessage));

    await expect(retryTransientDriverError(operation)).rejects.toThrow("bind message supplies");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("gives up when the database stays unreachable", async () => {
    const operation = vi.fn().mockRejectedValue(unreachableServer);

    await expect(retryTransientDriverError(operation)).rejects.toThrow("Can't reach database server");
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe("database unreachable detection", () => {
  it("recognises a refused socket, by Prisma code and by driver code", () => {
    expect(isDatabaseUnreachableError(unreachableServer)).toBe(true);
    expect(isDatabaseUnreachableError(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:51218"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isDatabaseUnreachableError({ code: "P1001" })).toBe(true);
  });

  it("recognises a refused socket nested in the driver error cause", () => {
    const wrapped = Object.assign(new Error("Invalid `prisma.user.findFirst()` invocation"), {
      cause: { code: "ECONNREFUSED" },
    });
    expect(isDatabaseUnreachableError(wrapped)).toBe(true);
  });

  it("recognises the refusal by message when no code survived", () => {
    expect(isDatabaseUnreachableError(new Error("connect ECONNREFUSED 127.0.0.1:51218"))).toBe(true);
    expect(isDatabaseUnreachableError(new Error("Can't reach database server at 127.0.0.1:51218"))).toBe(true);
  });

  it("does not treat ordinary failures as an absent database", () => {
    expect(isDatabaseUnreachableError(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))).toBe(false);
    expect(isDatabaseUnreachableError(new Error("bind message supplies 4 parameters, but prepared statement \"\" requires 0"))).toBe(false);
    expect(isDatabaseUnreachableError("connect ECONNREFUSED")).toBe(false);
    expect(isDatabaseUnreachableError(null)).toBe(false);
    expect(isDatabaseUnreachableError(undefined)).toBe(false);
  });

  it("keeps a dropped connection retryable without calling it unreachable", () => {
    expect(isTransientDriverError(closedConnection)).toBe(true);
    expect(isDatabaseUnreachableError(closedConnection)).toBe(false);
  });
});
