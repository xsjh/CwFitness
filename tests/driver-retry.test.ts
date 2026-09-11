import { describe, expect, it, vi } from "vitest";

import { isTransientDriverError, retryTransientDriverError } from "../lib/driver-retry";

const transientMessage = 'Database error. Code: `08P01`. Message: `bind message supplies 4 parameters, but prepared statement "" requires 0`';

describe("driver retry", () => {
  it("recognises the PostgreSQL prepared-statement mismatch", () => {
    expect(isTransientDriverError(new Error(transientMessage))).toBe(true);
    expect(isTransientDriverError(new Error("Unique constraint failed on the fields: (`email`)"))).toBe(false);
    expect(isTransientDriverError("bind message supplies 4 parameters")).toBe(false);
    expect(isTransientDriverError(undefined)).toBe(false);
  });

  it("replays the operation once when the driver reports the transient error", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error(transientMessage))
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
});
