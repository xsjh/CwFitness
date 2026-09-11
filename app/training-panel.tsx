"use client";

import { useState } from "react";
import { weightFromGrams } from "../lib/weights";
import type { Exercise, SessionExercise, SetResult, WorkoutSession } from "./workout-types";

type SetInput = {
  actualValue: number;
  actualWeight?: number;
};

type AddedExerciseInput = {
  exerciseId: string;
  setCount: number;
  targetValue: number;
  weight?: number;
  saveToWorkoutDay: boolean;
};

type TrainingPanelProps = {
  session: WorkoutSession;
  exercises: Exercise[];
  busy: boolean;
  weightUnit: "kg" | "lb";
  canEdit: boolean;
  offline: boolean;
  onRecordSet: (exercise: SessionExercise, setIndex: number, input: SetInput | null) => Promise<void>;
  onAddExercise: (input: AddedExerciseInput) => Promise<void>;
  onRemoveExercise: (exercise: SessionExercise) => Promise<void>;
  onSkipExercise: (exercise: SessionExercise) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onComplete: () => Promise<void>;
  onAbandon: () => Promise<void>;
  onTakeover: () => Promise<void>;
  onReorder: (exerciseIds: string[]) => Promise<void>;
};

function targetText(exercise: SessionExercise, weightUnit: "kg" | "lb") {
  const metric = exercise.targetType === "REPETITIONS" ? `${exercise.targetValue} 次` : `${exercise.targetValue} 秒`;
  const weight = exercise.resistanceType === "WEIGHTED" && exercise.weightGrams !== null
    ? ` · ${weightFromGrams(exercise.weightGrams, weightUnit).toFixed(1)} ${weightUnit}`
    : "";
  return metric + weight;
}

function resultText(exercise: SessionExercise, result: SetResult | undefined, weightUnit: "kg" | "lb") {
  if (!result) return "未记录";
  if (result.skipped) return "已跳过";
  const metric = exercise.targetType === "REPETITIONS" ? `${result.actualValue ?? 0} 次` : `${result.actualValue ?? 0} 秒`;
  const weight = result.actualWeightGrams === null ? "" : ` · ${weightFromGrams(result.actualWeightGrams, weightUnit).toFixed(1)} ${weightUnit}`;
  return metric + weight;
}

export function TrainingPanel({ session, exercises: availableExercises, busy, weightUnit, canEdit, offline, onRecordSet, onAddExercise, onRemoveExercise, onSkipExercise, onPause, onResume, onComplete, onAbandon, onTakeover, onReorder }: TrainingPanelProps) {
  const exercises = session.exercises.filter((exercise) => exercise.removedAt === null);
  const plannedSetCount = exercises.reduce((total, exercise) => total + exercise.setCount, 0);
  const recordedSetCount = exercises.reduce((total, exercise) => total + exercise.setResults.length, 0);
  const isPaused = session.status === "PAUSED";
  const readOnly = !canEdit;
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const selectedExercise = availableExercises.find((exercise) => exercise.id === selectedExerciseId);

  function completeSession() {
    if (readOnly || offline) return;
    if (recordedSetCount < plannedSetCount && !window.confirm("还有未记录的目标组。完成后它们会按未完成计算，确定结束训练吗？")) return;
    void onComplete();
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= exercises.length) return;
    const ids = exercises.map((exercise) => exercise.id);
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    void onReorder(ids);
  }

  return (
    <section className="workspace-section training-section" aria-labelledby="training-title">
      <header className="section-heading training-heading">
        <div>
          <p className="section-kicker">{isPaused ? "训练已挂起" : "训练进行中"}</p>
          <h1 id="training-title">完成每组后点击一次即可记录。</h1>
        </div>
        <div className="session-actions">
          {readOnly && <button className="action-button primary" type="button" disabled={busy} onClick={onTakeover}>在此设备接管</button>}
          <button className="action-button" type="button" disabled={busy || readOnly || offline} onClick={isPaused ? onResume : onPause}>
            {isPaused ? "继续训练" : "挂起"}
          </button>
          <button className="action-button primary" type="button" disabled={busy || readOnly || offline} onClick={completeSession}>结束训练</button>
          <button className="action-button quiet danger" type="button" disabled={busy || readOnly || offline} onClick={() => { if (window.confirm("放弃本次训练？已记录内容会保留，但不计入进展。")) void onAbandon(); }}>放弃</button>
        </div>
      </header>

      {readOnly && <p className="workspace-notice recovery" role="status">另一台设备正在编辑这场训练。当前页面为只读，可以刷新查看最新状态或在此设备接管。</p>}
      {offline && <p className="workspace-notice recovery" role="status">当前处于离线状态。训练记录会保存在本机，联网后自动同步。</p>}

      <div className="session-summary" data-testid="active-session">
        <div><span>完成组数</span><strong>{recordedSetCount} / {plannedSetCount}</strong></div>
        <div><span>训练日期</span><strong>{session.localStartDate}</strong></div>
        <div><span>动作数</span><strong>{exercises.length}</strong></div>
        <div><span>状态</span><strong>{isPaused ? "已挂起" : "进行中"}</strong></div>
      </div>

      <form
        className="session-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onAddExercise({
            exerciseId: String(data.get("exerciseId")),
            setCount: Number(data.get("setCount")),
            targetValue: Number(data.get("targetValue")),
          ...(selectedExercise?.resistanceType === "WEIGHTED" ? { weight: Number(data.get("weight")) } : {}),
          saveToWorkoutDay: data.get("saveToWorkoutDay") === "on",
          });
          event.currentTarget.reset();
          setSelectedExerciseId("");
        }}
      >
        <label><span>追加动作</span><select name="exerciseId" required value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)} disabled={busy || isPaused || readOnly}><option value="">选择动作</option>{availableExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
        <label><span>组数</span><input name="setCount" type="number" min={1} defaultValue={3} required disabled={busy || isPaused || readOnly} /></label>
        <label><span>{selectedExercise?.targetType === "DURATION" ? "目标秒数" : "目标次数"}</span><input name="targetValue" type="number" min={1} defaultValue={selectedExercise?.targetType === "DURATION" ? 30 : 8} required disabled={busy || isPaused || readOnly} /></label>
        {selectedExercise?.resistanceType === "WEIGHTED" && <label><span>目标重量（{weightUnit}）</span><input name="weight" type="number" min={0.1} step={0.1} required disabled={busy || isPaused || readOnly} /></label>}
        <label><span>保存到训练日</span><input name="saveToWorkoutDay" type="checkbox" defaultChecked disabled={busy || isPaused || readOnly} /></label>
        <button className="action-button" type="submit" disabled={busy || isPaused || readOnly}>追加动作</button>
      </form>

      <div className="training-list">
        {exercises.map((exercise, exerciseIndex) => {
          const results = new Map(exercise.setResults.map((result) => [result.setIndex, result]));
          return (
            <article className="training-exercise" key={exercise.id}>
              <header>
                <div>
                  <h2>{exercise.exerciseName}</h2>
                  <p>目标：{targetText(exercise, weightUnit)} · {exercise.setCount} 组</p>
                </div>
                <div className="training-exercise-actions">
                  {exercise.source === "ADDED" && <span className="tag">训练中追加</span>}
                  <button className="icon-button" type="button" aria-label={`上移${exercise.exerciseName}`} disabled={busy || isPaused || readOnly || exerciseIndex === 0} onClick={() => moveExercise(exerciseIndex, -1)}>↑</button>
                  <button className="icon-button" type="button" aria-label={`下移${exercise.exerciseName}`} disabled={busy || isPaused || readOnly || exerciseIndex === exercises.length - 1} onClick={() => moveExercise(exerciseIndex, 1)}>↓</button>
                  <button className="action-button compact quiet danger" type="button" disabled={busy || isPaused || readOnly} onClick={() => onRemoveExercise(exercise)}>移除动作</button>
                  <button className="action-button compact quiet" type="button" disabled={busy || isPaused || readOnly} onClick={() => onSkipExercise(exercise)}>跳过动作</button>
                </div>
              </header>
              <div className="set-grid">
                {Array.from({ length: exercise.setCount }, (_, index) => index + 1).map((setIndex) => {
                  const result = results.get(setIndex);
                  return (
                    <form className={`set-row ${result ? "recorded" : ""}`} key={setIndex} onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void onRecordSet(exercise, setIndex, {
                        actualValue: Number(data.get("actualValue")),
                        ...(exercise.resistanceType === "WEIGHTED" ? { actualWeight: Number(data.get("actualWeight")) } : {}),
                      });
                    }}>
                      <span className="set-number">第 {setIndex} 组</span>
                      <label className="set-input"><span>{exercise.targetType === "REPETITIONS" ? "实际次数" : "实际秒数"}</span><input name="actualValue" type="number" min={0} defaultValue={result?.actualValue ?? exercise.targetValue} required disabled={busy || isPaused || readOnly} /></label>
                      {exercise.resistanceType === "WEIGHTED" && <label className="set-input"><span>实际重量（{weightUnit}）</span><input name="actualWeight" type="number" min={0.1} step={0.1} defaultValue={weightFromGrams(result?.actualWeightGrams ?? exercise.weightGrams ?? 0, weightUnit).toFixed(1)} required disabled={busy || isPaused || readOnly} /></label>}
                      <span className="set-result">{resultText(exercise, result, weightUnit)}</span>
                      <button className="action-button compact" type="submit" disabled={busy || isPaused || readOnly}>{result ? "更新记录" : "记录完成"}</button>
                      <button className="action-button compact quiet" type="button" disabled={busy || isPaused || readOnly} onClick={() => onRecordSet(exercise, setIndex, null)}>
                        跳过
                      </button>
                    </form>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
