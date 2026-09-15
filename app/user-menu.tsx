"use client";

import { useEffect, useId, useRef, useState } from "react";

type UserMenuProps = {
  user: { name: string; email: string };
  busy: boolean;
  onSignOut: () => Promise<void>;
};

function accountHandle(email: string) {
  return `@${email.split("@")[0] || "user"}`;
}

function avatarLabel(name: string, email: string) {
  return (name.trim() || email.trim() || "U").slice(0, 1).toUpperCase();
}

export function UserMenu({ user, busy, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div className="workspace-account" ref={rootRef}>
      <button
        ref={triggerRef}
        className="user-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-label={`用户菜单，${user.name} ${accountHandle(user.email)}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="user-avatar" aria-hidden="true">{avatarLabel(user.name, user.email)}</span>
        <span className="user-identity">
          <strong>{user.name}</strong>
          <small>{accountHandle(user.email)}</small>
        </span>
        <svg className="user-menu-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="user-menu liquid-glass" id={menuId} role="menu" aria-label="用户菜单">
          <div className="user-menu-heading">
            <span className="user-avatar" aria-hidden="true">{avatarLabel(user.name, user.email)}</span>
            <span className="user-identity">
              <strong>{user.name}</strong>
              <small>{accountHandle(user.email)}</small>
            </span>
          </div>
          <div className="user-menu-divider" />
          <button type="button" role="menuitem" aria-disabled="true">账户资料<span>即将推出</span></button>
          <button type="button" role="menuitem" aria-disabled="true">偏好设置<span>即将推出</span></button>
          <button type="button" role="menuitem" aria-disabled="true">通知设置<span>即将推出</span></button>
          <div className="user-menu-divider" />
          <button className="user-menu-signout" type="button" role="menuitem" disabled={busy} onClick={() => void onSignOut()}>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
