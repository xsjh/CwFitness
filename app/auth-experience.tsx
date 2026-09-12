"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthShell } from "./auth-shell";
import { WorkoutWorkspace } from "./workout-workspace";
import { loadWorkoutSessionDraft } from "./workout-outbox";

type User = { id: string; name: string; email: string; emailVerified: boolean };
type AuthMode = "sign-in" | "sign-up" | "forgot-password";
const deviceStorageKey = "cwfitness-device-id";

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? "操作没有完成，请稍后重试。";
}

export function AuthExperience({ initialMode = "sign-in" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const clearUser = useCallback(() => setUser(null), []);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/get-session?disableCookieCache=true", { cache: "no-store" });
      if (!response.ok) return false;
      const session = (await response.json()) as { user?: User; session?: { id: string } } | null;
      if (!session?.user) return false;
      const savedDeviceId = window.localStorage.getItem(deviceStorageKey);
      const draft = savedDeviceId ? null : await loadWorkoutSessionDraft(session.user.id);
      const stableDeviceId = savedDeviceId ?? draft?.session.editingDeviceId ?? session.session?.id ?? crypto.randomUUID();
      window.localStorage.setItem(deviceStorageKey, stableDeviceId);
      setUser(session.user);
      setDeviceId(stableDeviceId);
      return true;
    } catch {
      return false;
    }
  }, []);

  const confirmAuthenticationLoss = useCallback(async () => {
    const sessionIsValid = await loadSession();
    if (!sessionIsValid) clearUser();
    return sessionIsValid;
  }, [clearUser, loadSession]);

  useEffect(() => {
    let active = true;
    // Session restoration is an external request after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession().then((loaded) => {
      if (!active || loaded) return;
    });
    return () => {
      active = false;
    };
  }, [loadSession]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));

    if (mode === "forgot-password") {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
      });
      setMessageTone(response.ok ? "success" : "error");
      setMessage(response.ok
        ? "如果该邮箱存在，重置密码邮件已发送。"
        : await errorMessage(response));
      setBusy(false);
      return;
    }

    const response = await fetch(`/api/auth/${mode === "sign-up" ? "sign-up" : "sign-in"}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(mode === "sign-up" ? { name: String(form.get("name")) } : {}),
        email,
        password: String(form.get("password")),
      }),
    });
    if (!response.ok) {
      setMessageTone("error");
      setMessage(await errorMessage(response));
      setBusy(false);
      return;
    }

    const loaded = await loadSession();
    setMessageTone("success");
    setMessage(loaded ? "" : "登录成功，正在恢复会话…");
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (response.ok) {
      setMode("sign-in");
      setShowPassword(false);
      setUser(null);
      setMessage("");
    } else {
      setMessageTone("error");
      setMessage(await errorMessage(response));
    }
    setBusy(false);
  }

  if (user) return <WorkoutWorkspace user={user} deviceId={deviceId} onSignOut={signOut} onAuthenticationLost={confirmAuthenticationLoss} onAccountDeleted={clearUser} />;

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submitAuth} data-testid="auth-form">
        <p className="eyebrow">{mode === "sign-in" ? "欢迎回来" : mode === "sign-up" ? "建立你的训练空间" : "找回登录方式"}</p>
        <h2>{mode === "sign-in" ? "继续训练。" : mode === "sign-up" ? "从第一组开始。" : "重新设置密码。"}</h2>
        <p className="intro">
          {mode === "sign-in"
            ? "登录以查看今天的计划，并从上次结束的地方继续。"
            : mode === "sign-up"
              ? "你的计划和训练记录只归属于你。"
              : "输入邮箱，我们会发送一次性密码重置链接。"}
        </p>
        {mode === "sign-up" && <label className="field"><span className="field-label">称呼</span><span className="input-wrap"><input name="name" autoComplete="name" placeholder="你的名字" required /></span></label>}
        <label className="field"><span className="field-label">邮箱</span><span className="input-wrap"><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required /></span></label>
        {mode !== "forgot-password" && <label className="field">
          <span className="field-label">密码</span>
          <span className="input-wrap password-wrap">
            <input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder="至少 8 个字符" required minLength={8} />
            <button className="reveal" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? "隐藏" : "显示"}</button>
          </span>
        </label>}
        {message && <p className={`status ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "请稍候…" : mode === "sign-in" ? "登录" : mode === "sign-up" ? "注册" : "发送重置链接"}</button>
        <div className="auth-links">
          {mode === "sign-in" && <button className="text-button" type="button" onClick={() => { setMode("forgot-password"); setMessage(""); }}>忘记密码？</button>}
          <button className="text-button" type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "注册" : "返回登录"}</button>
        </div>
      </form>
    </AuthShell>
  );
}
