import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WelcomeExperience } from "../app/welcome-experience";

describe("WelcomeExperience", () => {
  it("guides a visitor from the public welcome page to free registration", () => {
    render(<WelcomeExperience />);

    expect(screen.getByRole("heading", { name: "训练，需要一个能长期坚持的系统。" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "免费开始训练" })[0].getAttribute("href")).toBe("/auth?mode=sign-up");
  });

  it("uses product principles instead of fabricated testimonials or pricing", () => {
    render(<WelcomeExperience />);

    expect(screen.getByRole("heading", { name: "记录你真正完成的训练。" })).toBeTruthy();
    expect(screen.getAllByText("训练记录属于你").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });
});
