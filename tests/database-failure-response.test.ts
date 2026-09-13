import { createServer, type Server } from "node:net";

import { afterAll, describe, expect, it } from "vitest";

import { databaseEndpoint, withDatabaseFailureResponse } from "../lib/database-failure-response";
import { probeTcpPort } from "../lib/tcp-probe";

const servers: Server[] = [];
afterAll(() => { for (const server of servers) server.close(); });

/** Starts a throwaway listener and returns its port. */
async function listen(): Promise<number> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  return address.port;
}

/** Reserves a port and immediately releases it, so nothing is listening there. */
async function closedPort(): Promise<number> {
  const port = await listen();
  const server = servers.pop();
  if (!server) throw new Error("expected a server to close");
  await new Promise<void>((resolve) => { server.close(() => resolve()); });
  return port;
}

describe("probeTcpPort", () => {
  it("resolves true for a listening port", async () => {
    await expect(probeTcpPort(await listen())).resolves.toBe(true);
  });

  it("resolves false for a closed port instead of rejecting", async () => {
    await expect(probeTcpPort(await closedPort())).resolves.toBe(false);
  });
});

describe("databaseEndpoint", () => {
  it("reads the host and port out of a connection string", () => {
    expect(databaseEndpoint("postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable")).toEqual({
      host: "127.0.0.1", port: 51218,
    });
  });

  it("falls back to the default PostgreSQL port", () => {
    expect(databaseEndpoint("postgresql://postgres@localhost/db")?.port).toBe(5432);
  });

  it("returns null for a missing or unusable URL", () => {
    expect(databaseEndpoint(undefined)).toBeNull();
    expect(databaseEndpoint("not-a-url")).toBeNull();
    expect(databaseEndpoint("postgres://127.0.0.1:0/db")).toBeNull();
  });
});

describe("withDatabaseFailureResponse", () => {
  it("passes a successful response straight through", async () => {
    const ok = Response.json({ user: { id: "u1" } }, { status: 200 });
    await expect(withDatabaseFailureResponse(async () => ok)).resolves.toBe(ok);
  });

  it("passes a 4xx through untouched, because that is a real answer", async () => {
    const rejected = Response.json({ message: "Invalid email or password" }, { status: 401 });
    await expect(withDatabaseFailureResponse(async () => rejected)).resolves.toBe(rejected);
  });

  it("passes a 5xx that carries a body through, because it already explains itself", async () => {
    const explained = Response.json({ message: "Something specific broke" }, { status: 500 });
    await expect(withDatabaseFailureResponse(async () => explained)).resolves.toBe(explained);
  });

  it("answers 503 when a bare 5xx coincides with a database that is not listening", async () => {
    const port = await closedPort();
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/template1`;
    try {
      // better-auth answers an empty 500 when it cannot reach the database.
      const blank = new Response(null, { status: 500 });
      const response = await withDatabaseFailureResponse(async () => blank);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.code).toBe("DATABASE_UNREACHABLE");
      expect(body.message).toContain("数据库未连接");
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    }
  });

  it("keeps a bare 5xx as a 500 while the database is still reachable", async () => {
    const port = await listen();
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/template1`;
    try {
      const blank = new Response(null, { status: 500 });
      // Reachable database means the empty 500 is a genuine bug, not an absent server.
      await expect(withDatabaseFailureResponse(async () => blank)).resolves.toBe(blank);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    }
  });

  it("keeps a bare 5xx as a 500 when DATABASE_URL cannot be parsed", async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "not-a-url";
    try {
      const blank = new Response(null, { status: 500 });
      await expect(withDatabaseFailureResponse(async () => blank)).resolves.toBe(blank);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    }
  });
});
