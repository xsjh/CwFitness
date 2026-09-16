"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type Settings = { timeZone: string; weightUnit: "kg" | "lb" };

type BackupSummary = { plans: number; workoutDays: number; plannedExercises: number; exercises: number; workoutSessions: number; sessionExercises: number; setResults: number };
type DeletionSummary = BackupSummary & { telemetryEvents: number };

type SettingsPanelProps = { settings: Settings; busy: boolean; telemetryEnabled: boolean; onSave: (settings: Settings) => Promise<void>; onDelete: () => Promise<void>; onExport: () => Promise<void>; onPreviewRestore: (backup: unknown) => Promise<BackupSummary | undefined>; onRestore: (backup: unknown) => Promise<void>; onTelemetryPreference: (enabled: boolean) => Promise<void>; onPrepareDelete: () => Promise<DeletionSummary | undefined> };

export function SettingsDialog({ open, onClose, ...panelProps }: SettingsPanelProps & { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      window.setTimeout(() => returnFocus?.focus(), 0);
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog liquid-glass"
      aria-label="设置"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <button className="settings-dialog-close" type="button" aria-label="关闭设置" onClick={onClose}>×</button>
      <div className="settings-dialog-scroll"><SettingsPanel {...panelProps} /></div>
    </dialog>
  );
}

function SettingsPanel({ settings, busy, telemetryEnabled, onSave, onDelete, onExport, onPreviewRestore, onRestore, onTelemetryPreference, onPrepareDelete }: SettingsPanelProps) {
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [weightUnit, setWeightUnit] = useState(settings.weightUnit);
  const [backup, setBackup] = useState<unknown>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [error, setError] = useState("");
  const [deletionSummary, setDeletionSummary] = useState<DeletionSummary | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const nextSummary = await onPreviewRestore(parsed);
      if (nextSummary) { setBackup(parsed); setSummary(nextSummary); setError(""); }
    } catch { setBackup(null); setSummary(null); setError("该文件不是有效的 JSON 备份。"); }
  }
  return <section className="settings-panel" aria-labelledby="settings-title"><header className="section-heading"><div><p className="section-kicker">设置</p><h2 id="settings-title">让训练适合你。</h2></div><p>默认时区用于开始新训练；单位只改变显示与输入方式，不改变已存储的数据。</p></header><form className="inline-create-form" onSubmit={(event) => { event.preventDefault(); void onSave({ timeZone, weightUnit }); }}><label><span>时区</span><input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required /></label><label><span>重量单位</span><select value={weightUnit} onChange={(event) => setWeightUnit(event.target.value as "kg" | "lb")}><option value="kg">kg</option><option value="lb">lb</option></select></label><button className="action-button primary" type="submit" disabled={busy}>保存设置</button></form><section className="danger-zone"><h2>隐私</h2><label><span>最小遥测</span><input type="checkbox" checked={telemetryEnabled} disabled={busy} onChange={(event) => void onTelemetryPreference(event.target.checked)} />允许记录页面访问、功能操作类别、同步失败和已脱敏错误；绝不记录计划、动作、重量、次数、时长或训练日期。</label></section><section className="danger-zone"><h2>数据备份与恢复</h2><p>导出包含你的训练计划、动作、训练记录和设置，不包含登录凭据。恢复会完整替换当前数据。</p><button className="action-button" type="button" disabled={busy} onClick={() => void onExport()}>导出 JSON 备份</button><label><span>选择备份文件</span><input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void selectBackup(event)} /></label>{error && <p className="workspace-notice error" role="alert">{error}</p>}{summary && <div><p>将替换：{summary.plans} 个计划、{summary.workoutDays} 个训练日、{summary.plannedExercises} 个计划动作、{summary.exercises} 个动作、{summary.workoutSessions} 条训练记录、{summary.sessionExercises} 条训练动作和 {summary.setResults} 条组记录。</p><button className="action-button danger" type="button" disabled={busy} onClick={() => { if (backup && window.confirm("确认恢复？当前训练数据会被完整替换，且无法撤销。")) void onRestore(backup); }}>确认恢复并替换数据</button></div>}</section><section className="danger-zone"><h2>删除用户</h2><p>删除前建议先导出 JSON 备份。删除会撤销所有登录会话，并永久删除训练数据、设置、本机草稿和遥测标识。</p>{!deletionSummary ? <button className="action-button danger" type="button" disabled={busy} onClick={() => void onPrepareDelete().then((value) => { if (value) setDeletionSummary(value); })}>查看删除影响</button> : <div><p>将永久删除：{deletionSummary.plans} 个计划、{deletionSummary.exercises} 个动作、{deletionSummary.workoutSessions} 场训练、{deletionSummary.setResults} 条组记录和 {deletionSummary.telemetryEvents} 条遥测记录。</p><label><span>输入 DELETE 以确认</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><button className="action-button danger" type="button" disabled={busy || deleteConfirmation !== "DELETE"} onClick={() => void onDelete()}>永久删除用户</button></div>}</section></section>;
}
