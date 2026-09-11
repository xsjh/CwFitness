import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkoutWorkspace } from "../app/workout-workspace";

describe("WorkoutWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns to login when a background refresh receives Unauthorized", async () => {
    let authorized = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (!authorized) return Promise.resolve(Response.json({ error: "Unauthorized" }, { status: 401 }));
      const url = String(input);
      if (url === "/api/plans") return Promise.resolve(Response.json({ plans: [] }));
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAuthenticationLost = vi.fn().mockResolvedValue(false);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={onAuthenticationLost} onAccountDeleted={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plans", expect.anything()));

    authorized = false;
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(onAuthenticationLost).toHaveBeenCalledOnce());
  });

  it("loads protected workspace data one request at a time", async () => {
    let resolvePlans: ((response: Response) => void) | undefined;
    const plansResponse = new Promise<Response>((resolve) => { resolvePlans = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/plans") return plansResponse;
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkoutWorkspace user={{ id: "user-1", name: "测试用户", email: "user@example.com" }} deviceId="device-1" onSignOut={vi.fn()} onAuthenticationLost={vi.fn().mockResolvedValue(false)} onAccountDeleted={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plans", expect.anything()));

    expect(fetchMock).not.toHaveBeenCalledWith("/api/exercises", expect.anything());
    resolvePlans?.(Response.json({ plans: [] }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/exercises", expect.anything()));
  });
});
