import { describe, expect, it } from "vitest";

import { withDatabaseFailureResponse } from "../lib/database-failure-response";

describe("withDatabaseFailureResponse", () => {
  it("passes a successful response straight through", async () => {
    const ok = Response.json({ user: { id: "u1" } }, { status: 200 });
    await expect(withDatabaseFailureResponse(async () => ok)).resolves.toBe(ok);
  });

  it("turns an unreachable database into a 503 that names the cause", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:51218"), { code: "ECONNREFUSED" });

    const response = await withDatabaseFailureResponse(async () => { throw refused; });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("DATABASE_UNREACHABLE");
    expect(body.message).toContain("数据库未连接");
  });

  it("recognises the Prisma P1001 shape as well", async () => {
    const unreachable = Object.assign(new Error("Can't reach database server at 127.0.0.1:51218"), { code: "P1001" });
    const response = await withDatabaseFailureResponse(async () => { throw unreachable; });
    expect(response.status).toBe(503);
  });

  it("re-throws anything that is not a database failure so real bugs keep their 500", async () => {
    const bug = new Error("Cannot read properties of undefined");
    await expect(withDatabaseFailureResponse(async () => { throw bug; })).rejects.toThrow("Cannot read properties of undefined");
  });

  it("re-throws a transient statement failure instead of masking it as unreachable", async () => {
    const transient = new Error('bind message supplies 4 parameters, but prepared statement "" requires 0');
    await expect(withDatabaseFailureResponse(async () => { throw transient; })).rejects.toThrow("bind message supplies");
  });
});
