"use client";

import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import Lenis from "lenis";

const imageSet = [
  {
    src: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=85",
    alt: "深色健身房中的力量训练器械",
  },
  {
    src: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1600&q=85",
    alt: "运动员在深色背景中训练",
  },
  {
    src: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=85",
    alt: "健身训练中的杠铃",
  },
  {
    src: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=1600&q=85",
    alt: "深色背景中的训练动作分解",
  },
  {
    src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1600&q=85",
    alt: "训练者在器械上完成动作",
  },
];

// The gallery reads as one row that redistributes its own width: the hovered frame takes the space
// the other three give up. Weights are fractions of the row and must sum to 1, because hover
// reassigns that same budget — authoring them on any other scale makes "grow" shrink a wide frame.
// Every resting weight stays below the hover share, so no frame is already as wide as the target.
const galleryGrowth = [0.22, 0.42, 0.36];

// The four frames are intentionally offset from the baseline. Keeping the offsets in a single array
// means the row can be re-staggered without touching the hover logic.
const galleryLift = [0, 74, 30];

const principles = [
  ["计划不替你猜测", "清晰的目标，让每次开始都更容易。"],
  ["训练记录属于你", "你的计划、记录和历史只服务于你的训练。"],
  ["进度来自已完成的训练", "把已经发生的事变成下一次选择的依据。"],
  ["动作清单保持简洁", "每个 Workout Day 只保留真正需要完成的动作。"],
  ["节奏由你自己定义", "按自己的生活安排训练，再在真实记录中持续调整。"],
] as const;

export function WelcomeExperience() {
  useEffect(() => {
    void fetch("/api/auth/get-session?disableCookieCache=true", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ user?: unknown }> : null)
      .then((session) => { if (session?.user) window.location.replace("/auth"); })
      .catch(() => undefined);
    const revealElements = document.querySelectorAll<HTMLElement>("[data-scroll-motion]");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        if (!target.classList.contains("welcome-principle-viewport")) { target.classList.add("is-visible"); return; }
        target.classList.add("motion-ready");
        requestAnimationFrame(() => target.classList.add("is-visible"));
      }),
      // The entrance should not have started before the reader arrives. 0.55 of a section plus a
      // -10% bottom margin pushes the trigger past the middle of the viewport. Every section is
      // shorter than the viewport, so both bounds stay reachable at desktop and mobile sizes.
      { threshold: 0.55, rootMargin: "0px 0px -10% 0px" },
    );
    if (observer) revealElements.forEach((element) => observer.observe(element));
    else revealElements.forEach((element) => element.classList.add("is-visible"));

    const updateScrollProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollableHeight > 0 ? Math.min(window.scrollY / scrollableHeight, 1) : 0;
      document.documentElement.style.setProperty("--welcome-scroll-progress", progress.toFixed(4));
      document.documentElement.dataset.welcomeScrolled = progress > 0.018 ? "true" : "false";

    };
    updateScrollProgress();
    window.addEventListener("resize", updateScrollProgress);
    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const forceMotion = document.querySelector(".welcome-page")?.getAttribute("data-force-motion") === "true";
    const lenis = reducedMotion && !forceMotion ? undefined : new Lenis({ autoRaf: true, anchors: true, lerp: 0.075, wheelMultiplier: 1.1 });
    const stopObservingLenis = lenis?.on("scroll", updateScrollProgress);
    if (!lenis) window.addEventListener("scroll", updateScrollProgress, { passive: true });

    // Pointer-driven pose for the three liquid-glass showcases.
    //
    // The pose is written as custom properties rather than as `transform` on purpose: an inline
    // transform outranks every rule in the stylesheet, so writing one here would wipe the scroll
    // entrance the panel just played. The stylesheet composes the variables instead.
    //
    // Follow uses the frame-rate-independent form so the panels feel identical at 30 and 144 Hz.
    // Each panel reads the pointer as an offset from its OWN centre, which is what separates the
    // three: with a shared viewport reading all three would sit at the same angle and read as one
    // rigid prop. Angles stay inside the 12-16deg readable band; past that the type starts to shear.
    const tiltPanels = [...document.querySelectorAll<HTMLElement>(".welcome-motion-tilt")];
    const MAX_YAW = 7;
    const MAX_PITCH = 5;
    const MAX_SHIFT = 6;
    const FOLLOW_K = 7;
    // The glow trails the pointer a touch slower than the pose does. A highlight that snaps to the
    // cursor reads as a sticker under a torch; the lag is what makes it read as light on wet glass.
    const GLOW_K = 5;
    const pointer = { x: -1, y: -1 };
    let pointerInside = false;
    // The glow is a per-panel read of the pointer, so the hovered panel is tracked per panel rather
    // than from one page-wide flag. `glowTarget` is the raw pointer offset in the panel's own box
    // (-1..1 on each axis); `glow` is the damped value actually written out.
    const poses = new WeakMap<HTMLElement, { yaw: number; pitch: number; shiftX: number; shiftY: number }>();
    const glows = new WeakMap<HTMLElement, { x: number; y: number; targetX: number; targetY: number; hovered: boolean }>();
    let tiltFrame = 0;
    let lastTiltTime = 0;
    let tiltRunning = false;
    const motionAllowed = !reducedMotion || forceMotion;

    const projectTilt = (time: number) => {
      // Clamp on both ends. A negative dt is reachable whenever the rAF timestamp and the
      // performance.now() that seeded lastTiltTime come from different clocks: alpha then flips
      // sign, and the follow diverges exponentially instead of converging. Capping the step also
      // stops a backgrounded tab (one huge dt) from snapping the pose in a single frame.
      const dt = Math.min(Math.max((time - lastTiltTime) / 1000, 0), 0.05);
      lastTiltTime = time;
      const alpha = 1 - Math.exp(-FOLLOW_K * dt);
      const glowAlpha = 1 - Math.exp(-GLOW_K * dt);
      let settled = true;

      // Read every rect before writing any property. Interleaving the two forces a synchronous
      // layout on each write, because the next read cannot be served from the stale one.
      const viewportHeight = window.innerHeight;
      const boxes = tiltPanels.map((panel) => panel.getBoundingClientRect());

      for (let index = 0; index < tiltPanels.length; index++) {
        const panel = tiltPanels[index];
        const box = boxes[index];
        const pose = poses.get(panel) ?? { yaw: 0, pitch: 0, shiftX: 0, shiftY: 0 };
        // A panel that is off screen has no pointer relationship worth computing, and its rect would
        // clamp to the extreme and sit there. Only the panels actually in view take a pose.
        const onScreen = box.bottom > -240 && box.top < viewportHeight + 240;
        // -1 at the panel's left/top edge, +1 at its right/bottom edge. Reading from each panel's own
        // centre is what separates the three: a shared viewport reading put them all at one angle.
        const offsetX = onScreen && pointerInside && box.width > 0 ? (pointer.x - (box.x + box.width / 2)) / (box.width * 0.9) : 0;
        const offsetY = onScreen && pointerInside && box.height > 0 ? (pointer.y - (box.y + box.height / 2)) / (box.height * 0.9) : 0;
        const clampedX = Math.max(-1.4, Math.min(1.4, offsetX));
        const clampedY = Math.max(-1.4, Math.min(1.4, offsetY));
        const target = {
          yaw: clampedX * MAX_YAW,
          // Pointer above the panel's centre has to tip the top edge toward the viewer, which is a
          // negative rotateX; the yaw term already carries the right sign for the same gesture.
          pitch: clampedY * MAX_PITCH,
          shiftX: clampedX * MAX_SHIFT,
          shiftY: clampedY * MAX_SHIFT * 0.6,
        };
        pose.yaw += (target.yaw - pose.yaw) * alpha;
        pose.pitch += (target.pitch - pose.pitch) * alpha;
        pose.shiftX += (target.shiftX - pose.shiftX) * alpha;
        pose.shiftY += (target.shiftY - pose.shiftY) * alpha;
        poses.set(panel, pose);

        panel.style.setProperty("--tilt-yaw", `${pose.yaw.toFixed(3)}deg`);
        panel.style.setProperty("--tilt-pitch", `${pose.pitch.toFixed(3)}deg`);
        panel.style.setProperty("--tilt-shift-x", `${pose.shiftX.toFixed(2)}px`);
        panel.style.setProperty("--tilt-shift-y", `${pose.shiftY.toFixed(2)}px`);

        // The glow is placed by the pointer's own coordinates inside this panel, not derived from the
        // pose. Pointer above the panel's top edge (or left of it) is reachable while a neighbour is
        // hovered, so the raw reading is clamped into the box rather than allowed to leave it.
        const glow = glows.get(panel) ?? { x: 50, y: 50, targetX: 50, targetY: 50, hovered: false };
        if (glow.hovered && box.width > 0 && box.height > 0) {
          const rawX = ((pointer.x - box.x) / box.width) * 100;
          const rawY = ((pointer.y - box.y) / box.height) * 100;
          glow.targetX = Math.max(0, Math.min(100, rawX));
          glow.targetY = Math.max(0, Math.min(100, rawY));
        }
        glow.x += (glow.targetX - glow.x) * glowAlpha;
        glow.y += (glow.targetY - glow.y) * glowAlpha;
        glows.set(panel, glow);
        panel.style.setProperty("--glass-light-x", `${glow.x.toFixed(2)}%`);
        panel.style.setProperty("--glass-light-y", `${glow.y.toFixed(2)}%`);

        // A hovered panel has to keep ticking even after the pose settles, so the glow can finish
        // converging; a released panel settles once the pose is at rest, exactly as before.
        const glowSettled = !glow.hovered
          ? true
          : Math.abs(glow.targetX - glow.x) < 0.1 && Math.abs(glow.targetY - glow.y) < 0.1;
        if (Math.abs(target.yaw - pose.yaw) > 0.01 || Math.abs(target.pitch - pose.pitch) > 0.01
          || Math.abs(target.shiftX - pose.shiftX) > 0.05 || Math.abs(target.shiftY - pose.shiftY) > 0.05
          || !glowSettled) {
          settled = false;
        }
      }

      if (!settled || pointerInside) { tiltFrame = requestAnimationFrame(projectTilt); return; }
      tiltFrame = 0;
      tiltRunning = false;
    };

    const startTilt = () => {
      if (!motionAllowed || tiltRunning || tiltPanels.length === 0) return;
      tiltRunning = true;
      lastTiltTime = performance.now();
      tiltFrame = requestAnimationFrame(projectTilt);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointerInside = true;
      let anyHovered = false;
      // Hover is judged against each panel's own box. A pointer anywhere else on the page must not
      // light a panel up: that page-wide flag was why a single mouse move left all three glowing.
      for (const panel of tiltPanels) {
        const box = panel.getBoundingClientRect();
        const hovered = event.clientX >= box.left && event.clientX <= box.right
          && event.clientY >= box.top && event.clientY <= box.bottom;
        const glow = glows.get(panel) ?? { x: 50, y: 50, targetX: 50, targetY: 50, hovered: false };
        glow.hovered = hovered;
        glows.set(panel, glow);
        if (hovered) {
          panel.dataset.tiltLive = "";
          anyHovered = true;
        } else {
          delete panel.dataset.tiltLive;
        }
      }
      if (anyHovered) startTilt();
    };
    // A panel left frozen wherever the pointer happened to exit is a panel that lies about being
    // interactive. Release it back to the resting pose instead.
    const releaseTilt = () => {
      pointerInside = false;
      for (const panel of tiltPanels) {
        const glow = glows.get(panel);
        if (glow) glow.hovered = false;
        delete panel.dataset.tiltLive;
      }
      startTilt();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", releaseTilt);
    window.addEventListener("blur", releaseTilt);

    // Gallery accordion. Hovering one frame has to grow it AND shrink the other three together, so
    // the row keeps filling its own width. Each frame's authored share lives in `data-gallery-rest`
    // rather than being read back off the inline style: React owns that property, and a StrictMode
    // remount runs this effect's cleanup between the two passes, so reading the DOM value back sees
    // an empty string and every frame silently falls back to a uniform share.
    const galleryFrames = [...document.querySelectorAll<HTMLElement>("[data-gallery-row] > figure")];
    // The grown frame takes this share of the row. The rest split the remainder in proportion to
    // their own resting weights, so every one of them shrinks and the row keeps its proportions.
    const GROWN_WEIGHT = 0.46;
    let galleryIndex = -1;

    const applyGalleryGrowth = (activeIndex: number) => {
      if (activeIndex === galleryIndex) return;
      galleryIndex = activeIndex;
      const restWeights = galleryFrames.map((frame) => Number(frame.dataset.galleryRest ?? 1));
      const restTotal = restWeights.reduce(
        (sum, weight, index) => index === activeIndex ? sum : sum + weight, 0,
      );
      const remaining = 1 - GROWN_WEIGHT;
      for (let index = 0; index < galleryFrames.length; index++) {
        const frame = galleryFrames[index];
        const weight = activeIndex === -1
          ? restWeights[index]
          : index === activeIndex ? GROWN_WEIGHT : (restWeights[index] / restTotal) * remaining;
        frame.style.setProperty("--gallery-grow", String(weight));
        if (activeIndex === -1) delete frame.dataset.galleryActive;
        else if (index === activeIndex) frame.dataset.galleryActive = "";
        else delete frame.dataset.galleryActive;
      }
    };

    const onGalleryPointerMove = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const frame = target?.closest<HTMLElement>("[data-gallery-row] > figure") ?? null;
      if (!frame) { applyGalleryGrowth(-1); return; }
      // A pointer moving between two frames of the row must not flash the whole row back to rest:
      // only the index that actually changed is re-applied.
      applyGalleryGrowth(galleryFrames.indexOf(frame));
    };
    const onGalleryLeave = () => applyGalleryGrowth(-1);

    const galleryRow = document.querySelector<HTMLElement>("[data-gallery-row]");
    galleryRow?.addEventListener("pointermove", onGalleryPointerMove, { passive: true });
    galleryRow?.addEventListener("pointerleave", onGalleryLeave);

    return () => {
      observer?.disconnect();
      stopObservingLenis?.();
      lenis?.destroy();
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", releaseTilt);
      window.removeEventListener("blur", releaseTilt);
      galleryRow?.removeEventListener("pointermove", onGalleryPointerMove);
      galleryRow?.removeEventListener("pointerleave", onGalleryLeave);
      if (tiltFrame) cancelAnimationFrame(tiltFrame);
      // Restore the authored weight rather than removing the property: React set it from the style
      // prop and will not re-apply it, so removal would leave the frame with no weight at all.
      for (const frame of galleryFrames) {
        frame.style.setProperty("--gallery-grow", frame.dataset.galleryRest ?? "1");
        delete frame.dataset.galleryActive;
      }
      for (const panel of tiltPanels) {
        for (const property of ["--tilt-yaw", "--tilt-pitch", "--tilt-shift-x", "--tilt-shift-y", "--glass-light-x", "--glass-light-y"]) {
          panel.style.removeProperty(property);
        }
        delete panel.dataset.tiltLive;
      }
      delete document.documentElement.dataset.welcomeScrolled;
      document.documentElement.style.removeProperty("--welcome-scroll-progress");
    };
  }, []);

  return (
    <main className="welcome-page" data-force-motion="true">
      <div className="welcome-route-progress" aria-hidden="true"><span /></div>
      <section className="welcome-hero" id="top">
        <div className="welcome-hero-image" />
        <div className="welcome-hero-cadence" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <nav className="welcome-nav" aria-label="主导航">
          <Link className="welcome-brand welcome-nav-enter" href="#top"><span aria-hidden="true" />CwFitness</Link>
          <div className="welcome-nav-links welcome-nav-enter">
            <a href="#top">主页</a><a href="#method">关于</a><a href="#questions">联系我们</a>
          </div>
          <Link className="welcome-nav-cta welcome-nav-enter" href="/auth">登录</Link>
        </nav>
        <div className="welcome-hero-content welcome-reveal is-visible">
          <p className="welcome-kicker welcome-hero-line">你的训练，清晰可见</p>
          <h1 className="welcome-hero-line">训练，需要一个能长期坚持的系统。</h1>
          <p className="welcome-hero-line">建立每周的 Workout Plan，专注完成今天的 Workout Session，再从每一次真实记录里看见进步。</p>
          <div className="welcome-actions welcome-hero-actions">
            <Link className="welcome-primary" href="/auth?mode=sign-up">免费开始训练 <span aria-hidden="true">↗</span></Link>
            <a className="welcome-text-link" href="#method">查看如何运作 <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <p className="welcome-scroll-cue"><strong aria-hidden="true">↓</strong><span>向下探索</span></p>
      </section>

      <section className="welcome-intro welcome-section welcome-reveal welcome-entrance welcome-motion-intro" data-scroll-motion>
        <p className="welcome-kicker">训练不是随机发生的</p>
        <div><h2>为今天留出明确的下一步。</h2><p>不是更复杂的表格，也不是更多分心的数据。CwFitness 让计划、执行和回顾自然连成一条线，让你在每次训练开始时都知道该做什么。</p></div>
      </section>

      <section className="welcome-feature welcome-section" id="method">
        <div className="welcome-feature-copy welcome-reveal welcome-entrance welcome-motion-copy-left" data-scroll-motion><p className="welcome-index">01 / 03</p><p className="welcome-kicker">建立 Workout Plan</p><h2>先定义节奏，<br />再开始训练。</h2><p>用可重复的 Workout Day 安排每周。每个 Exercise、目标和组数都在开始前清楚就位。</p><a href="#flow">看看计划如何展开 <span aria-hidden="true">↘</span></a></div>
        <div className="welcome-plan-visual liquid-glass welcome-reveal welcome-entrance welcome-motion-tilt" id="flow" aria-label="Workout Plan 示例" data-scroll-motion>
          <div className="welcome-visual-top"><span>本周计划</span><b>第 2 周</b></div>
          <div className="welcome-plan-day active"><span>01</span><strong>上肢力量</strong><em>5 个动作</em></div>
          <div className="welcome-plan-day"><span>02</span><strong>下肢力量</strong><em>4 个动作</em></div>
          <div className="welcome-plan-day"><span>03</span><strong>恢复与核心</strong><em>3 个动作</em></div>
          <div className="welcome-visual-orbit" aria-hidden="true" />
        </div>
      </section>

      <section className="welcome-image-break welcome-reveal welcome-image-scene welcome-motion-image" data-scroll-motion><img src={imageSet[0].src} alt={imageSet[0].alt} /><div><p className="welcome-kicker">有计划，也有余地</p><h2>把注意力留给<br />眼前这一组。</h2></div></section>

      <section className="welcome-feature welcome-feature-reverse welcome-section">
        <div className="welcome-session-visual liquid-glass welcome-reveal welcome-entrance welcome-motion-tilt welcome-motion-session" aria-label="Workout Session 示例" data-scroll-motion><div className="welcome-session-header"><span>进行中的训练</span><b>28:42</b></div><h3>杠铃深蹲</h3><p>4 组 × 8 次 · 75 kg</p><div className="welcome-set-row complete"><span>01</span><b>8 × 75</b><i>完成</i></div><div className="welcome-set-row complete"><span>02</span><b>8 × 75</b><i>完成</i></div><div className="welcome-set-row current"><span>03</span><b>8 × 75</b><i>记录本组</i></div></div>
        <div className="welcome-feature-copy welcome-reveal welcome-entrance welcome-motion-copy-right" data-scroll-motion><p className="welcome-index">02 / 03</p><p className="welcome-kicker">完成 Workout Session</p><h2>记录你真正完成的训练。</h2><p>训练开始后，目标会固定下来。逐组记录重量、次数或时长，在节奏里完成，而不是在界面里周旋。</p></div>
      </section>

      <section className="welcome-feature welcome-section">
        <div className="welcome-feature-copy welcome-reveal welcome-entrance welcome-motion-copy-left" data-scroll-motion><p className="welcome-index">03 / 03</p><p className="welcome-kicker">查看 Plan Progress</p><h2>让长期变化，<br />有迹可循。</h2><p>只有已完成的 Workout Session 会成为进度的一部分。回看同一 Workout Plan 中的训练日期和 Exercise 趋势，判断下一步，而不是凭感觉猜测。</p></div>
        <div className="welcome-progress-visual liquid-glass welcome-reveal welcome-entrance welcome-motion-tilt welcome-motion-progress" aria-label="Plan Progress 视觉示例" data-scroll-motion><div className="welcome-visual-top"><span>训练记录示例</span><b>你的节奏</b></div><div className="welcome-progress-stat"><strong>记录</strong><span>已完成的 Workout Session</span></div><div className="welcome-chart" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="welcome-progress-footer"><span>周一</span><span>周三</span><span>周五</span><span>今天</span></div></div>
      </section>

      <section className="welcome-gallery welcome-section"><div className="welcome-gallery-heading welcome-reveal welcome-motion-copy-left" data-scroll-motion><p className="welcome-kicker">清醒地训练</p><h2>有结构，<br />才能更专注。</h2></div><div className="welcome-gallery-grid" data-gallery-row>{(imageSet.slice(1, 4) as Array<{ src: string; alt: string }>).map((image, index) => <figure className="welcome-reveal welcome-motion-gallery" data-scroll-motion data-gallery-rest={galleryGrowth[index]} key={image.src} style={{ "--gallery-lift": `${galleryLift[index]}px`, "--gallery-grow": `${galleryGrowth[index]}` } as CSSProperties}><img src={image.src} alt={image.alt} /></figure>)}</div></section>

      <section className="welcome-principles" id="principles"><div className="welcome-principles-heading welcome-reveal welcome-motion-intro" data-scroll-motion><p className="welcome-kicker">CwFitness 的方式</p><h2>少一点噪音，<br />多一点确定。</h2></div><div className="welcome-principle-viewport" aria-label="产品原则" data-scroll-motion><div className="welcome-principle-track">{[...principles, ...principles].map(([title, copy], index) => <div className="welcome-principle-card" aria-hidden={index >= principles.length} key={`${title}-${index}`}><article className="liquid-glass"><span>0{(index % principles.length) + 1}</span><h3>{title}</h3><p>{copy}</p></article></div>)}</div></div></section>

      <section className="welcome-stages welcome-section"><div className="welcome-stages-heading welcome-reveal welcome-motion-copy-left" data-scroll-motion><p className="welcome-kicker">从今天开始</p><h2>一个更简单的<br />训练循环。</h2></div><div className="welcome-stage-grid">{[["规划", "创建 Workout Plan，让每周训练有共同的方向。"], ["训练", "从一个 Workout Day 开始，完成属于今天的 Workout Session。"], ["进步", "回顾 Plan Progress，带着真实记录继续前进。"]].map(([title, copy], index) => <article className="welcome-stage liquid-glass welcome-reveal welcome-motion-stage" data-scroll-motion key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p><Link href="/auth?mode=sign-up">免费开始 <b aria-hidden="true">↗</b></Link></article>)}</div></section>

      <section className="welcome-faq welcome-section" id="questions"><div className="welcome-faq-heading welcome-reveal welcome-motion-copy-left" data-scroll-motion><p className="welcome-kicker">常见问题</p><h2>开始之前，<br />你可能想知道。</h2></div><div className="welcome-faq-list welcome-reveal welcome-motion-faq" data-scroll-motion><details><summary>CwFitness 适合谁？</summary><p>适合希望自己规划、完成并回看训练的人。你不需要追随一套预设计划，产品从你的 Workout Plan 开始。</p></details><details><summary>我的训练记录会怎样被使用？</summary><p>它们用于呈现你自己的 Workout Session 与 Plan Progress，不会成为公开排行榜或社交内容。</p></details><details><summary>能否从简单计划开始？</summary><p>可以。先为一个 Workout Day 添加几个 Exercise，随着训练稳定下来再调整结构。</p></details></div></section>

      <section className="welcome-final"><div className="welcome-final-image" /><div className="welcome-final-content welcome-reveal welcome-motion-intro" data-scroll-motion><p className="welcome-kicker">从今天开始</p><h2>让训练，<br />持续发生。</h2><p>给每一次投入一个清晰的位置，再让时间为你留下答案。</p><Link className="welcome-primary" href="/auth?mode=sign-up">免费开始训练 <span aria-hidden="true">↗</span></Link></div></section>
      <footer className="welcome-footer"><Link className="welcome-brand" href="#top"><span aria-hidden="true" />CwFitness</Link><p>计划、完成、回顾。</p><Link href="/auth">登录</Link></footer>
    </main>
  );
}
