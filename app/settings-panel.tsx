"use client";

import { ChangeEvent, useState } from "react";

type Settings = { timeZone: string; weightUnit: "kg" | "lb" };

type BackupSummary = { plans: number; workoutDays: number; plannedExercises: number; exercises: number; workoutSessions: number; sessionExercises: number; setResults: number };

export function SettingsPanel({ settings, busy, onSave, onDelete, onExport, onPreviewRestore, onRestore }: { settings: Settings; busy: boolean; onSave: (settings: Settings) => Promise<void>; onDelete: () => Promise<void>; onExport: () => Promise<void>; onPreviewRestore: (backup: unknown) => Promise<BackupSummary | undefined>; onRestore: (backup: unknown) => Promise<void> }) {
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [weightUnit, setWeightUnit] = useState(settings.weightUnit);
  const [backup, setBackup] = useState<unknown>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [error, setError] = useState("");
  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const nextSummary = await onPreviewRestore(parsed);
      if (nextSummary) { setBackup(parsed); setSummary(nextSummary); setError(""); }
    } catch { setBackup(null); setSummary(null); setError("该文件不是有效的 JSON 备份。"); }
  }
  return <section className="workspace-section" aria-labelledby="settings-title"><header className="section-heading"><div><p className="section-kicker">设置</p><h1 id="settings-title">让训练适合你。</h1></div><p>默认时区用于开始新训练；单位只改变显示与输入方式，不改变已存储的数据。</p></header><form className="inline-create-form" onSubmit={(event) => { event.preventDefault(); void onSave({ timeZone, weightUnit }); }}><label><span>时区</span><input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required /></label><label><span>重量单位</span><select value={weightUnit} onChange={(event) => setWeightUnit(event.target.value as "kg" | "lb")}><option value="kg">kg</option><option value="lb">lb</option></select></label><button className="action-button primary" type="submit" disabled={busy}>保存设置</button></form><section className="danger-zone"><h2>数据备份与恢复</h2><p>导出包含你的训练计划、动作、训练记录和设置，不包含登录凭据。恢复会完整替换当前数据。</p><button className="action-button" type="button" disabled={busy} onClick={() => void onExport()}>导出 JSON 备份</button><label><span>选择备份文件</span><input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void selectBackup(event)} /></label>{error && <p className="workspace-notice error" role="alert">{error}</p>}{summary && <div><p>将替换：{summary.plans} 个计划、{summary.workoutDays} 个训练日、{summary.plannedExercises} 个计划动作、{summary.exercises} 个动作、{summary.workoutSessions} 条训练记录、{summary.sessionExercises} 条训练动作和 {summary.setResults} 条组记录。</p><button className="action-button danger" type="button" disabled={busy} onClick={() => { if (backup && window.confirm("确认恢复？当前训练数据会被完整替换，且无法撤销。")) void onRestore(backup); }}>确认恢复并替换数据</button></div>}</section><section className="danger-zone"><h2>删除用户</h2><p>这会永久删除你的计划、动作和训练记录，且无法恢复。</p><button className="action-button danger" type="button" disabled={busy} onClick={() => { if (window.confirm("永久删除用户及所有训练数据？此操作无法恢复。")) void onDelete(); }}>永久删除用户</button></section></section>;
}
