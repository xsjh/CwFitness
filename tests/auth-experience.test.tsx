import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthExperience } from "../app/auth-experience";

describe("AuthExperience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not sign out a User who logs in while the initial session check is pending", async () => {
    let resolveInitialSession: ((response: Response) => void) | undefined;
    const initialSession = new Promise<Response>((resolve) => { resolveInitialSession = resolve; });
    let sessionCheckCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/get-session")) {
        sessionCheckCount += 1;
        return sessionCheckCount === 1
          ? initialSession
          : Promise.resolve(Response.json({ user: { id: "user-1", name: "测试用户", email: "user@example.com", emailVerified: false }, session: { id: "session-1" } }));
      }
      if (url.includes("/api/auth/sign-in/email")) return Promise.resolve(Response.json({}));
      if (url.includes("/api/auth/sign-out")) return Promise.resolve(Response.json({}));
      return Promise.resolve(Response.json({ plans: [], exercises: [], workoutSession: null, workoutSessions: [], settings: { timeZone: "UTC", weightUnit: "kg" }, dataVersion: 0, telemetryEnabled: false, progress: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthExperience />);
    await user.type(screen.getByLabelText("邮箱"), "user@example.com");
    await user.type(screen.getByLabelText("密码"), "test-password");
    await user.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(sessionCheckCount).toBe(2));

    await act(async () => resolveInitialSession?.(Response.json(null)));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/sign-out", expect.anything()));
  });

  it("keeps a User in the workspace when the first protected request is transiently Unauthorized", async () => {
    let sessionCheckCount = 0;
    let plansRequestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/get-session")) {
        sessionCheckCount += 1;
        return Promise.resolve(Response.json(sessionCheckCount === 1 ? null : {
          user: { id: "user-1", name: "测试用户", email: "user@example.com", emailVerified: false },
          session: { id: "session-1" },
        }));
      }
      if (url.includes("/api/auth/sign-in/email")) return Promise.resolve(Response.json({}));
      if (url === "/api/plans") {
        plansRequestCount += 1;
        return Promise.resolve(plansRequestCount === 1
          ? Response.json({ error: "Unauthorized" }, { status: 401 })
          : Response.json({ plans: [] }));
      }
      if (url === "/api/exercises") return Promise.resolve(Response.json({ exercises: [] }));
      if (url === "/api/workout-sessions/active") return Promise.resolve(Response.json({ workoutSession: null }));
      if (url === "/api/workout-sessions") return Promise.resolve(Response.json({ workoutSessions: [] }));
      if (url === "/api/settings") return Promise.resolve(Response.json({ settings: { timeZone: "UTC", weightUnit: "kg" } }));
      if (url === "/api/backup/version") return Promise.resolve(Response.json({ dataVersion: 0 }));
      if (url === "/api/privacy") return Promise.resolve(Response.json({ telemetryEnabled: false }));
      return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthExperience />);
    await user.type(screen.getByLabelText("邮箱"), "user@example.com");
    await user.type(screen.getByLabelText("密码"), "test-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(plansRequestCount).toBe(2));
    expect(screen.queryByTestId("auth-form")).toBeNull();
  });
});
