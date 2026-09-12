import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WelcomeExperience } from "../app/welcome-experience";

describe("WelcomeExperience", () => {
  it("guides a visitor from the public welcome page to free registration", () => {
    render(<WelcomeExperience />);

    expect(screen.getByRole("heading", { name: "训练，需要一个能长期坚持的系统。" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "免费开始训练" })[0].getAttribute("href")).toBe("/auth?mode=sign-up");
    expect(screen.getByRole("link", { name: "主页" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "关于" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "联系我们" })).toBeTruthy();
    expect(document.querySelector(".welcome-route-progress")).toBeTruthy();
    expect(document.querySelector(".welcome-hero-cadence")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "免费开始训练" })[0].className).toContain("welcome-primary");
    expect(document.querySelectorAll(".welcome-nav-enter")).toHaveLength(3);
    expect(screen.getByText("向下探索").closest(".welcome-scroll-cue")).toBeTruthy();
  });

  it("uses product principles instead of fabricated testimonials or pricing", () => {
    render(<WelcomeExperience />);

    expect(screen.getByRole("heading", { name: "记录你真正完成的训练。" })).toBeTruthy();
    expect(screen.getAllByText("训练记录属于你").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.getByLabelText("Workout Plan 示例").className).toContain("welcome-entrance");
    expect(screen.getByLabelText("Plan Progress 视觉示例").className).toContain("welcome-entrance");
    expect(screen.getByRole("img", { name: "深色健身房中的力量训练器械" }).closest(".welcome-image-scene")).toBeTruthy();
    expect(screen.getByLabelText("Workout Plan 示例").className).toContain("is-visible");
  });
});
