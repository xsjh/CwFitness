import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WelcomeExperience } from "../app/welcome-experience";

const { lenisInstance, LenisMock, observerInstances, IntersectionObserverMock } = vi.hoisted(() => {
  const lenisInstance = { destroy: vi.fn(), on: vi.fn(() => vi.fn()) };
  const observerInstances: Array<{ callback: (entries: unknown[]) => void; options?: unknown; observed: Element[] }> = [];
  const IntersectionObserverMock = vi.fn(function IntersectionObserverMock(
    callback: (entries: unknown[]) => void,
    options?: unknown,
  ) {
    const record = { callback, options, observed: [] as Element[] };
    observerInstances.push(record);
    return {
      observe: (element: Element) => record.observed.push(element),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      takeRecords: vi.fn(() => []),
    };
  });
  return { lenisInstance, LenisMock: vi.fn(function LenisMock() { return lenisInstance; }), observerInstances, IntersectionObserverMock };
});

vi.mock("lenis", () => ({ default: LenisMock }));

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
    expect(document.querySelector(".welcome-page")?.getAttribute("data-force-motion")).toBe("true");
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

  it("assigns distinct scroll-triggered motion treatments below the hero", () => {
    render(<WelcomeExperience />);

    const scrollTargets = document.querySelectorAll("[data-scroll-motion]");
    expect(scrollTargets.length).toBeGreaterThanOrEqual(14);
    expect(document.querySelector(".welcome-hero [data-scroll-motion]")).toBeNull();
    expect(screen.getByLabelText("Workout Plan 示例").className).toContain("welcome-motion-tilt");
    expect(screen.getByLabelText("Workout Session 示例").className).toContain("welcome-motion-session");
    expect(screen.getByLabelText("Plan Progress 视觉示例").className).toContain("welcome-motion-progress");
    expect(document.querySelectorAll(".welcome-motion-gallery")).toHaveLength(2);
    expect(document.querySelectorAll(".welcome-motion-stage")).toHaveLength(3);
  });

  it("uses Lenis for damped scroll inertia unless reduced motion is requested", () => {
    const originalMatchMedia = window.matchMedia;
    LenisMock.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query !== "(prefers-reduced-motion: reduce)" }),
    });

    render(<WelcomeExperience />);
    expect(LenisMock).toHaveBeenCalledWith({ autoRaf: true, anchors: true, lerp: 0.075, wheelMultiplier: 1.1 });
    expect(lenisInstance.on).toHaveBeenCalledWith("scroll", expect.any(Function));

    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });

  it("keeps Lenis active when this page explicitly forces motion", () => {
    const originalMatchMedia = window.matchMedia;
    LenisMock.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }),
    });

    render(<WelcomeExperience />);
    expect(LenisMock).toHaveBeenCalledWith({ autoRaf: true, anchors: true, lerp: 0.075, wheelMultiplier: 1.1 });

    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });

  it("waits until a section is nearly half visible before its scroll entrance fires", () => {
    // At 0.13 the reveal started as soon as a section poked over the fold, so it had already
    // finished playing by the time the section was properly in view. The threshold has to stay
    // high enough that the entrance lands while the section is actually being read.
    const originalIO = globalThis.IntersectionObserver;
    observerInstances.length = 0;
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    });

    render(<WelcomeExperience />);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].options).toEqual({ threshold: 0.45 });
    expect(observerInstances[0].observed).toHaveLength(document.querySelectorAll("[data-scroll-motion]").length);
    expect(observerInstances[0].observed.length).toBeGreaterThanOrEqual(14);

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIO,
    });
  });

  it("only reveals a section once the observer reports it as intersecting", () => {
    const originalIO = globalThis.IntersectionObserver;
    observerInstances.length = 0;
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    });

    render(<WelcomeExperience />);

    const targets = [...document.querySelectorAll<HTMLElement>("[data-scroll-motion]")];
    // Nothing is revealed by default now that an observer exists: the CSS entrance stays
    // pending until the callback says the section is far enough into the viewport.
    expect(targets.some((target) => target.classList.contains("is-visible"))).toBe(false);

    const observer = observerInstances[0];
    observer.callback([{ isIntersecting: false, target: targets[0] }]);
    expect(targets[0].classList.contains("is-visible")).toBe(false);

    observer.callback([{ isIntersecting: true, target: targets[0] }]);
    expect(targets[0].classList.contains("is-visible")).toBe(true);

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIO,
    });
  });
});
