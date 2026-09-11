"use client";

import { useMemo, useState } from "react";
import { weightFromGrams } from "../lib/weights";
import type { Plan, WorkoutHistorySession } from "./workout-types";

type Range = "12" | "4w" | "12w" | "all";

export type ProgressPoint = {
  date: string;
  value: number;
  weightGrams: number | null;
  achievementRate: number;
};

function dateDaysAgo(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function duration(seconds: number | null) {
  const total = seconds ?? 0;
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`;
}

export function filterTrend(points: ProgressPoint[], range: Range, now = new Date()) {
  if (range === "12") return points.slice(0, 12);
  if (range === "all") return points;
  return points.filter((point) => point.date >= dateDaysAgo(now, range === "4w" ? 28 : 84));
}

export function completedDays(sessions: WorkoutHistorySession[]) {
  return new Set(sessions.map((session) => session.localStartDate));
}

export function dailyTrainingTime(sessions: WorkoutHistorySession[], date: string) {
  return sessions
    .filter((session) => session.localStartDate === date)
    .reduce((total, session) => total + (session.trainingTimeSeconds ?? 0), 0);
}

export function dailyTrainingTimes(sessions: WorkoutHistorySession[], now = new Date()) {
  const start = dateDaysAgo(now, 27);
  return [...new Set(sessions.map((session) => session.localStartDate))]
    .filter((date) => date >= start)
    .sort()
    .map((date) => ({ date, seconds: dailyTrainingTime(sessions, date) }));
}

function calendarDays(now: Date) {
  return Array.from({ length: 28 }, (_, index) => dateDaysAgo(now, 27 - index));
}

type ProgressViewProps = { plans: Plan[]; workoutSessions: WorkoutHistorySession[]; weightUnit: "kg" | "lb" };

export function ProgressView({ plans, workoutSessions, weightUnit }: ProgressViewProps) {
  const [range, setRange] = useState<Range>("12");
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? "");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const plan = plans.find((item) => item.id === selectedPlanId) ?? plans[0];
  const planSessions = workoutSessions.filter((session) => session.workoutPlanId === plan?.id);
  const exercises = useMemo(() => {
    const options = new Map<string, string>();
    planSessions.forEach((session) => session.exercises.forEach((exercise) => options.set(exercise.exerciseId, exercise.exerciseName)));
    return [...options.entries()].map(([id, name]) => ({ id, name }));
  }, [planSessions]);
  const exerciseId = exercises.some((item) => item.id === selectedExerciseId) ? selectedExerciseId : exercises[0]?.id;
  const points = planSessions.flatMap((session) => session.exercises
    .filter((exercise) => exercise.exerciseId === exerciseId && exercise.removedAt === null)
    .map((exercise) => {
      const result = session.exerciseResults.find((item) => item.sessionExerciseId === exercise.id);
      const recorded = exercise.setResults.find((item) => !item.skipped && item.actualValue !== null);
      return { date: session.localStartDate, value: recorded?.actualValue ?? 0, weightGrams: recorded?.actualWeightGrams ?? exercise.weightGrams, achievementRate: result?.achievementRate ?? 0 };
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const visiblePoints = filterTrend(points, range);
  const days = completedDays(workoutSessions);
  const recent = workoutSessions.slice(0, 5);
  const dailyTimes = dailyTrainingTimes(workoutSessions);
  const weeklySeconds = Array.from({ length: 4 }, (_, index) => {
    const end = dateDaysAgo(new Date(), index * 7);
    const start = dateDaysAgo(new Date(), index * 7 + 6);
    return workoutSessions.filter((session) => session.localStartDate >= start && session.localStartDate <= end).reduce((total, session) => total + (session.trainingTimeSeconds ?? 0), 0);
  });

  return <section className="workspace-section progress-section" aria-labelledby="progress-title">
    <header className="section-heading"><div><p className="section-kicker">训练进展</p><h1 id="progress-title">看见频率，而非混合成绩。</h1></div><p>日历仅标记完成训练；每条趋势只属于一个训练计划中的一个动作。</p></header>
    <div className="progress-grid">
      <article className="progress-card calendar-card"><h2>最近四周</h2><div className="training-calendar" aria-label="完成训练日历">{calendarDays(new Date()).map((date) => <span key={date} className={days.has(date) ? "completed" : ""} aria-label={`${date}${days.has(date) ? " 已完成训练" : ""}`}>{date.slice(-2)}</span>)}</div></article>
      <article className="progress-card"><h2>每周训练时间</h2><div className="weekly-duration">{weeklySeconds.map((seconds, index) => <div key={index}><span>第 {4 - index} 周</span><strong>{duration(seconds)}</strong></div>)}</div></article>
      <article className="progress-card"><h2>最近完成</h2>{recent.length === 0 ? <p className="empty-state">完成训练后会显示在这里。</p> : <ul className="recent-sessions">{recent.map((session) => <li key={session.id}><span>{session.localStartDate} · {session.workoutDayName}</span><strong>{duration(session.trainingTimeSeconds)}</strong></li>)}</ul>}</article>
    </div>
    <article className="progress-card daily-time-card"><h2>每日训练时间</h2>{dailyTimes.length === 0 ? <p className="empty-state">最近四周尚无已完成训练。</p> : <div className="daily-duration">{dailyTimes.map((item) => <div key={item.date}><span>{item.date}</span><strong>{duration(item.seconds)}</strong></div>)}</div>}</article>
    <section className="trend-panel" aria-labelledby="trend-title"><div className="trend-controls"><div><p className="section-kicker">动作趋势</p><h2 id="trend-title">单个动作表现</h2></div><label>训练计划<select value={plan?.id ?? ""} onChange={(event) => { setSelectedPlanId(event.target.value); setSelectedExerciseId(""); }}>{plans.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>动作<select value={exerciseId ?? ""} onChange={(event) => setSelectedExerciseId(event.target.value)}>{exercises.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <div className="range-controls" aria-label="趋势范围">{(["12", "4w", "12w", "all"] as const).map((item) => <button type="button" key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item === "12" ? "最近 12 次" : item === "all" ? "全部" : `最近 ${item.slice(0, -1)} 周`}</button>)}</div>
      {visiblePoints.length === 0 ? <p className="empty-state">这个计划中的动作完成训练后会形成趋势。</p> : <ol className="trend-list">{visiblePoints.map((point, index) => <li key={`${point.date}-${index}`}><span>{point.date}</span><strong>{point.value}{planSessions.flatMap((session) => session.exercises).find((exercise) => exercise.exerciseId === exerciseId)?.targetType === "DURATION" ? " 秒" : " 次"}</strong><span>{point.weightGrams === null ? "自重" : `${weightFromGrams(point.weightGrams, weightUnit).toFixed(1)} ${weightUnit}`}</span><span>达成 {point.achievementRate}%</span></li>)}</ol>}
    </section>
    <section className="plan-progress" aria-label="计划完成概览">{plans.map((item) => { const sessions = workoutSessions.filter((session) => session.workoutPlanId === item.id); return <article key={item.id}><strong>{item.name}</strong><span>{sessions.length} 场已完成</span><span>最近：{sessions[0] ? `${sessions[0].localStartDate} · ${duration(sessions[0].trainingTimeSeconds)}` : "—"}</span></article>; })}</section>
  </section>;
}
