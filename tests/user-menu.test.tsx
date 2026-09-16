import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "../app/user-menu";

const testUser = { name: "测试用户", email: "user@example.com" };

describe("UserMenu", () => {
  it("shows the User name and account handle beside an initial avatar", () => {
    render(<UserMenu user={testUser} busy={false} onSignOut={vi.fn()} onOpenSettings={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /测试用户 @user/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("测")).toBeTruthy();
    expect(screen.queryByText("user@example.com")).toBeNull();
  });

  it("opens placeholder options and keeps sign out available inside the secondary menu", async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const onOpenSettings = vi.fn();
    render(<UserMenu user={testUser} busy={false} onSignOut={onSignOut} onOpenSettings={onOpenSettings} />);

    const trigger = screen.getByRole("button", { name: /测试用户 @user/ });
    await userEvent.setup().click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /账户资料即将推出/ }).getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "偏好设置" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await userEvent.setup().click(trigger);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "退出登录" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("closes on Escape and returns focus to the avatar trigger", async () => {
    render(<UserMenu user={testUser} busy={false} onSignOut={vi.fn()} onOpenSettings={vi.fn()} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /测试用户 @user/ });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the User continues elsewhere and disables sign out while an operation is busy", async () => {
    render(
      <>
        <UserMenu user={testUser} busy onSignOut={vi.fn()} onOpenSettings={vi.fn()} />
        <button type="button">继续训练</button>
      </>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /用户菜单/ }));
    expect((screen.getByRole("menuitem", { name: "退出登录" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "继续训练" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
