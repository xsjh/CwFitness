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
    expect(document.querySelectorAll(".welcome-motion-gallery")).toHaveLength(3);
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
    // finished playing by the time the section was properly in view. The threshold plus a negative
    // bottom margin have to stay high enough that the entrance lands while the section is being read.
    const originalIO = globalThis.IntersectionObserver;
    observerInstances.length = 0;
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    });

    render(<WelcomeExperience />);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].options).toEqual({ threshold: 0.55, rootMargin: "0px 0px -10% 0px" });
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

  // jsdom does not lay out, so every rect is 0x0 and a panel's centre would equal the pointer,
  // producing a zero offset. Stub the rects to place the panel somewhere on a 1440x900 viewport,
  // and drive the follow loop synchronously so nothing depends on real frames.
  const stubTiltEnvironment = () => {
    const originals = {
      rect: Element.prototype.getBoundingClientRect,
      raf: globalThis.requestAnimationFrame,
      cancelRaf: globalThis.cancelAnimationFrame,
      now: performance.now,
    };
    const panelRect = { x: 400, y: 300, width: 560, height: 440, top: 300, left: 400, right: 960, bottom: 740, toJSON: () => ({}) } as DOMRect;
    Element.prototype.getBoundingClientRect = function stubRect() {
      return this.classList?.contains("welcome-motion-tilt") ? panelRect : originals.rect.call(this);
    };
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });

    // The loop seeds lastTiltTime from performance.now(), so the frame clock has to start there too.
    // A clock starting at 0 would hand the first frame a large negative dt, which is exactly the
    // shape of the regression covered below rather than a neutral starting condition.
    let clock = originals.now.call(performance);
    const scheduled: Array<(time: number) => void> = [];
    globalThis.requestAnimationFrame = ((callback: (time: number) => void) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    const settle = (frames = 120, options?: { from?: number }) => {
      if (options?.from !== undefined) clock = options.from;
      for (let index = 0; index < frames; index++) {
        const next = scheduled.shift();
        if (!next) break;
        clock += 16.7;
        next(clock);
      }
    };

    const restore = () => {
      Element.prototype.getBoundingClientRect = originals.rect;
      globalThis.requestAnimationFrame = originals.raf;
      globalThis.cancelAnimationFrame = originals.cancelRaf;
    };

    return { settle, restore, originals, clock: () => clock };
  };

  it("tilts each liquid-glass showcase toward the pointer from that panel's own centre", () => {
    const { settle, restore } = stubTiltEnvironment();

    render(<WelcomeExperience />);
    const panels = [...document.querySelectorAll<HTMLElement>(".welcome-motion-tilt")];
    expect(panels).toHaveLength(3);
    // Nothing is written until the pointer arrives, so the CSS resting pose is left untouched.
    expect(panels[0].style.getPropertyValue("--tilt-yaw")).toBe("");
    expect(panels[0].hasAttribute("data-tilt-live")).toBe(false);

    // Pointer to the panel's left edge: the panel leans left.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 410, clientY: 520 }));
    settle();
    const leftYaw = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-yaw"));
    expect(panels[0].hasAttribute("data-tilt-live")).toBe(true);
    expect(leftYaw).toBeLessThan(0);

    // Pointer to the right edge: the sign of the yaw has to flip.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 950, clientY: 520 }));
    settle();
    const rightYaw = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-yaw"));
    expect(rightYaw).toBeGreaterThan(0);

    // A pointer above the panel pitches it forward; below pitches it back.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 680, clientY: 310 }));
    settle();
    const topPitch = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-pitch"));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 680, clientY: 730 }));
    settle();
    const bottomPitch = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-pitch"));
    expect(topPitch).toBeLessThan(0);
    expect(bottomPitch).toBeGreaterThan(0);

    // The angles stay inside the readable band: past roughly 16deg the type inside starts to shear.
    expect(Math.abs(rightYaw)).toBeLessThanOrEqual(7.01);
    expect(Math.abs(bottomPitch)).toBeLessThanOrEqual(5.01);

    // Leaving the page releases the pose instead of freezing it wherever the pointer exited.
    document.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    settle();
    expect(Math.abs(Number.parseFloat(panels[0].style.getPropertyValue("--tilt-yaw")))).toBeLessThan(0.05);
    expect(Math.abs(Number.parseFloat(panels[0].style.getPropertyValue("--tilt-pitch")))).toBeLessThan(0.05);

    restore();
  });

  it("places the glass glow on the pointer and dims it when the pointer leaves that panel", () => {
    const { settle, restore } = stubTiltEnvironment();

    render(<WelcomeExperience />);
    const panels = [...document.querySelectorAll<HTMLElement>(".welcome-motion-tilt")];

    // The panel occupies x 400..960, y 300..740. A pointer inside it lands the glow on the same
    // spot rather than on the side the panel leans away from — the old pose-derived reading.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 484, clientY: 388 }));
    settle();
    expect(panels[0].hasAttribute("data-tilt-live")).toBe(true);
    const nearTopLeftX = Number.parseFloat(panels[0].style.getPropertyValue("--glass-light-x"));
    const nearTopLeftY = Number.parseFloat(panels[0].style.getPropertyValue("--glass-light-y"));
    expect(nearTopLeftX).toBeLessThan(20);
    expect(nearTopLeftY).toBeLessThan(25);

    // Moving to the opposite corner carries the glow across the panel with it.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900, clientY: 700 }));
    settle();
    const nearBottomRightX = Number.parseFloat(panels[0].style.getPropertyValue("--glass-light-x"));
    const nearBottomRightY = Number.parseFloat(panels[0].style.getPropertyValue("--glass-light-y"));
    expect(nearBottomRightX).toBeGreaterThan(nearTopLeftX);
    expect(nearBottomRightY).toBeGreaterThan(nearTopLeftY);

    // A pointer elsewhere on the page must not light a panel up; that page-wide flag was the bug.
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 1300, clientY: 120 }));
    settle();
    expect(panels[0].hasAttribute("data-tilt-live")).toBe(false);
    expect(panels[1].hasAttribute("data-tilt-live")).toBe(false);
    expect(panels[2].hasAttribute("data-tilt-live")).toBe(false);

    restore();
  });

  it("keeps the follow converging when a frame arrives with a stale timestamp", () => {
    // A frame timestamp older than performance.now() — which is what the loop seeds lastTiltTime
    // from — used to hand the follow a negative dt, flipping the gain negative and diverging the
    // pose exponentially. The pose must stay inside the readable band instead of exploding past it.
    const { settle, restore, originals } = stubTiltEnvironment();
    Object.defineProperty(performance, "now", { configurable: true, value: () => 1_000_000 });

    render(<WelcomeExperience />);
    const panels = [...document.querySelectorAll<HTMLElement>(".welcome-motion-tilt")];
    expect(panels).toHaveLength(3);

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 950, clientY: 520 }));
    // The loop is now queued; the stub hands the next frame a timestamp far behind the seeded clock.
    settle(1, { from: 0 });
    const afterStaleFrame = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-yaw"));
    expect(Number.isFinite(afterStaleFrame)).toBe(true);
    expect(Math.abs(afterStaleFrame)).toBeLessThanOrEqual(7.01);
    expect(Math.abs(Number.parseFloat(panels[0].style.getPropertyValue("--tilt-pitch")))).toBeLessThanOrEqual(5.01);

    settle();
    const settledYaw = Number.parseFloat(panels[0].style.getPropertyValue("--tilt-yaw"));
    expect(Math.abs(settledYaw)).toBeLessThanOrEqual(7.01);
    expect(settledYaw).toBeGreaterThan(0);

    restore();
    Object.defineProperty(performance, "now", { configurable: true, value: originals.now });
  });

  it("leaves the resting pose untouched when the pointer never enters", () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancelRaf = globalThis.cancelAnimationFrame;
    let called = 0;
    globalThis.requestAnimationFrame = ((callback: (time: number) => void) => { called++; callback(16.7); return called; }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    render(<WelcomeExperience />);
    const panels = [...document.querySelectorAll<HTMLElement>(".welcome-motion-tilt")];
    for (const panel of panels) {
      expect(panel.style.getPropertyValue("--tilt-yaw")).toBe("");
      expect(panel.style.getPropertyValue("--tilt-pitch")).toBe("");
      expect(panel.hasAttribute("data-tilt-live")).toBe(false);
    }
    expect(called).toBe(0);

    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it("grows the hovered gallery frame and shrinks the other three", () => {
    render(<WelcomeExperience />);

    const row = document.querySelector<HTMLElement>("[data-gallery-row]");
    expect(row).toBeTruthy();
    const frames = [...row!.querySelectorAll<HTMLElement>("figure")];
    expect(frames).toHaveLength(3);

    // Each frame carries its own authored resting weight, so the row is staggered by design rather
    // than by a uniform share.
    const rest = frames.map((frame) => Number(frame.style.getPropertyValue("--gallery-grow")));
    expect(rest.every((weight) => weight > 0)).toBe(true);
    expect(new Set(rest).size).toBeGreaterThan(1);

    // Hovering one frame grows it and shrinks every other frame, with the row keeping its total.
    const total = (list: HTMLElement[]) => list.reduce((sum, frame) => sum + Number(frame.style.getPropertyValue("--gallery-grow")), 0);
    expect(total(frames)).toBeCloseTo(1, 6);

    const hovered = frames[2];
    hovered.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    const grown = Number.parseFloat(hovered.style.getPropertyValue("--gallery-grow"));
    expect(grown).toBeGreaterThan(rest[2]);
    for (const index of [0, 1]) {
      expect(Number.parseFloat(frames[index].style.getPropertyValue("--gallery-grow"))).toBeLessThan(rest[index]);
    }
    expect(total(frames)).toBeCloseTo(1, 6);
    expect(hovered.hasAttribute("data-gallery-active")).toBe(true);
    expect(frames[0].hasAttribute("data-gallery-active")).toBe(false);

    // Every frame has to be growable: a resting weight above the hover share would make "grow" a
    // shrink for that frame, which is the bug this assertion exists to catch.
    for (let index = 0; index < frames.length; index++) {
      frames[index].dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
      expect(Number.parseFloat(frames[index].style.getPropertyValue("--gallery-grow"))).toBeGreaterThan(rest[index]);
    }

    // Moving to a sibling must not flash the row back to rest: the newly hovered frame takes over
    // directly and the previously hovered one shrinks.
    frames[0].dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(frames[0].hasAttribute("data-gallery-active")).toBe(true);
    expect(hovered.hasAttribute("data-gallery-active")).toBe(false);
    expect(Number.parseFloat(frames[0].style.getPropertyValue("--gallery-grow"))).toBeGreaterThan(rest[0]);

    // Leaving the row restores every authored weight exactly.
    row!.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(frames.map((frame) => Number(frame.style.getPropertyValue("--gallery-grow")))).toEqual(rest);
    expect(frames.some((frame) => frame.hasAttribute("data-gallery-active"))).toBe(false);
  });
});
