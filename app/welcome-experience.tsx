"use client";

import Link from "next/link";
import { useEffect } from "react";

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
];

const principles = ["计划不替你猜测", "训练记录属于你", "进度来自已完成的训练"];

export function WelcomeExperience() {
  useEffect(() => {
    void fetch("/api/auth/get-session?disableCookieCache=true", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ user?: unknown }> : null)
      .then((session) => { if (session?.user) window.location.replace("/auth"); })
      .catch(() => undefined);
    const revealElements = document.querySelectorAll(".welcome-reveal");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")),
      { threshold: 0.13 },
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
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
      delete document.documentElement.dataset.welcomeScrolled;
      document.documentElement.style.removeProperty("--welcome-scroll-progress");
    };
  }, []);

  return (
    <main className="welcome-page">
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

      <section className="welcome-intro welcome-section welcome-reveal welcome-entrance">
        <p className="welcome-kicker">训练不是随机发生的</p>
        <div><h2>为今天留出明确的下一步。</h2><p>不是更复杂的表格，也不是更多分心的数据。CwFitness 让计划、执行和回顾自然连成一条线，让你在每次训练开始时都知道该做什么。</p></div>
      </section>

      <section className="welcome-feature welcome-section" id="method">
        <div className="welcome-feature-copy welcome-reveal welcome-entrance"><p className="welcome-index">01 / 03</p><p className="welcome-kicker">建立 Workout Plan</p><h2>先定义节奏，<br />再开始训练。</h2><p>用可重复的 Workout Day 安排每周。每个 Exercise、目标和组数都在开始前清楚就位。</p><a href="#flow">看看计划如何展开 <span aria-hidden="true">↘</span></a></div>
        <div className="welcome-plan-visual liquid-glass welcome-reveal welcome-entrance" id="flow" aria-label="Workout Plan 示例">
          <div className="welcome-visual-top"><span>本周计划</span><b>第 2 周</b></div>
          <div className="welcome-plan-day active"><span>01</span><strong>上肢力量</strong><em>5 个动作</em></div>
          <div className="welcome-plan-day"><span>02</span><strong>下肢力量</strong><em>4 个动作</em></div>
          <div className="welcome-plan-day"><span>03</span><strong>恢复与核心</strong><em>3 个动作</em></div>
          <div className="welcome-visual-orbit" aria-hidden="true" />
        </div>
      </section>

      <section className="welcome-image-break welcome-reveal welcome-image-scene"><img src={imageSet[0].src} alt={imageSet[0].alt} /><div><p className="welcome-kicker">有计划，也有余地</p><h2>把注意力留给<br />眼前这一组。</h2></div></section>

      <section className="welcome-feature welcome-feature-reverse welcome-section">
        <div className="welcome-session-visual liquid-glass welcome-reveal welcome-entrance" aria-label="Workout Session 示例"><div className="welcome-session-header"><span>进行中的训练</span><b>28:42</b></div><h3>杠铃深蹲</h3><p>4 组 × 8 次 · 75 kg</p><div className="welcome-set-row complete"><span>01</span><b>8 × 75</b><i>完成</i></div><div className="welcome-set-row complete"><span>02</span><b>8 × 75</b><i>完成</i></div><div className="welcome-set-row current"><span>03</span><b>8 × 75</b><i>记录本组</i></div></div>
        <div className="welcome-feature-copy welcome-reveal welcome-entrance"><p className="welcome-index">02 / 03</p><p className="welcome-kicker">完成 Workout Session</p><h2>记录你真正完成的训练。</h2><p>训练开始后，目标会固定下来。逐组记录重量、次数或时长，在节奏里完成，而不是在界面里周旋。</p></div>
      </section>

      <section className="welcome-feature welcome-section">
        <div className="welcome-feature-copy welcome-reveal welcome-entrance"><p className="welcome-index">03 / 03</p><p className="welcome-kicker">查看 Plan Progress</p><h2>让长期变化，<br />有迹可循。</h2><p>只有已完成的 Workout Session 会成为进度的一部分。回看同一 Workout Plan 中的训练日期和 Exercise 趋势，判断下一步，而不是凭感觉猜测。</p></div>
        <div className="welcome-progress-visual liquid-glass welcome-reveal welcome-entrance" aria-label="Plan Progress 视觉示例"><div className="welcome-visual-top"><span>训练记录示例</span><b>你的节奏</b></div><div className="welcome-progress-stat"><strong>记录</strong><span>已完成的 Workout Session</span></div><div className="welcome-chart" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="welcome-progress-footer"><span>周一</span><span>周三</span><span>周五</span><span>今天</span></div></div>
      </section>

      <section className="welcome-gallery welcome-section"><div className="welcome-gallery-heading welcome-reveal"><p className="welcome-kicker">清醒地训练</p><h2>有结构，<br />才能更专注。</h2></div><div className="welcome-gallery-grid"><figure className="welcome-reveal"><img src={imageSet[1].src} alt={imageSet[1].alt} /></figure><figure className="welcome-reveal"><img src={imageSet[2].src} alt={imageSet[2].alt} /></figure></div></section>

      <section className="welcome-principles" id="principles"><div className="welcome-principles-heading welcome-reveal"><p className="welcome-kicker">CwFitness 的方式</p><h2>少一点噪音，<br />多一点确定。</h2></div><div className="welcome-principle-track" aria-label="产品原则">{[...principles, ...principles].map((principle, index) => <article className="liquid-glass" key={`${principle}-${index}`}><span>0{(index % 3) + 1}</span><h3>{principle}</h3><p>{index % 3 === 0 ? "清晰的目标，让每次开始都更容易。" : index % 3 === 1 ? "你的计划、记录和历史只服务于你的训练。" : "把已经发生的事变成下一次选择的依据。"}</p></article>)}</div></section>

      <section className="welcome-stages welcome-section"><div className="welcome-stages-heading welcome-reveal"><p className="welcome-kicker">从今天开始</p><h2>一个更简单的<br />训练循环。</h2></div><div className="welcome-stage-grid">{[["规划", "创建 Workout Plan，让每周训练有共同的方向。"], ["训练", "从一个 Workout Day 开始，完成属于今天的 Workout Session。"], ["进步", "回顾 Plan Progress，带着真实记录继续前进。"]].map(([title, copy], index) => <article className="welcome-stage liquid-glass welcome-reveal" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p><Link href="/auth?mode=sign-up">免费开始 <b aria-hidden="true">↗</b></Link></article>)}</div></section>

      <section className="welcome-faq welcome-section" id="questions"><div className="welcome-faq-heading welcome-reveal"><p className="welcome-kicker">常见问题</p><h2>开始之前，<br />你可能想知道。</h2></div><div className="welcome-faq-list welcome-reveal"><details><summary>CwFitness 适合谁？</summary><p>适合希望自己规划、完成并回看训练的人。你不需要追随一套预设计划，产品从你的 Workout Plan 开始。</p></details><details><summary>我的训练记录会怎样被使用？</summary><p>它们用于呈现你自己的 Workout Session 与 Plan Progress，不会成为公开排行榜或社交内容。</p></details><details><summary>能否从简单计划开始？</summary><p>可以。先为一个 Workout Day 添加几个 Exercise，随着训练稳定下来再调整结构。</p></details></div></section>

      <section className="welcome-final"><div className="welcome-final-image" /><div className="welcome-final-content welcome-reveal"><p className="welcome-kicker">从今天开始</p><h2>让训练，<br />持续发生。</h2><p>给每一次投入一个清晰的位置，再让时间为你留下答案。</p><Link className="welcome-primary" href="/auth?mode=sign-up">免费开始训练 <span aria-hidden="true">↗</span></Link></div></section>
      <footer className="welcome-footer"><Link className="welcome-brand" href="#top"><span aria-hidden="true" />CwFitness</Link><p>计划、完成、回顾。</p><Link href="/auth">登录</Link></footer>
    </main>
  );
}
