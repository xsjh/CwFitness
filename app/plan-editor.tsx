"use client";

import { FormEvent, useState } from "react";
import { weightFromGrams } from "../lib/weights";
import type { Exercise, ExerciseProgress, Plan, PlannedExercise, WorkoutDay } from "./workout-types";

export type PlannedExerciseInput = {
  exerciseId: string;
  setCount: number;
  targetValue: number;
  weight?: number;
  weightUnit?: "kg" | "lb";
};

type PlanEditorProps = {
  plans: Plan[];
  exercises: Exercise[];
  selectedPlanId: string;
  busy: boolean;
  progress: ExerciseProgress[];
  weightUnit: "kg" | "lb";
  onSelectPlan: (planId: string) => void;
  onCreatePlan: (name: string) => Promise<void>;
  onRenamePlan: (plan: Plan, name: string) => Promise<void>;
  onUpdatePlanVisual: (plan: Plan, accentColor: string, coverKey: string) => Promise<void>;
  onSetArchived: (plan: Plan, archived: boolean) => Promise<void>;
  onCreateDay: (plan: Plan, name: string, suggestedWeekday: number | null) => Promise<void>;
  onUpdateDay: (plan: Plan, day: WorkoutDay, name: string, suggestedWeekday: number | null) => Promise<void>;
  onDeleteDay: (plan: Plan, day: WorkoutDay) => Promise<void>;
  onAddPlannedExercise: (plan: Plan, day: WorkoutDay, input: PlannedExerciseInput) => Promise<void>;
  onUpdatePlannedExercise: (plan: Plan, day: WorkoutDay, planned: PlannedExercise, input: Omit<PlannedExerciseInput, "exerciseId">) => Promise<void>;
  onDeletePlannedExercise: (plan: Plan, day: WorkoutDay, planned: PlannedExercise) => Promise<void>;
  onStartWorkout: (day: WorkoutDay) => Promise<void>;
};

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function targetLabel(targetValue: number, targetType: Exercise["targetType"]) {
  return targetType === "REPETITIONS" ? `${targetValue} 次` : `${targetValue} 秒`;
}

function plannedTarget(planned: PlannedExercise, weightUnit: "kg" | "lb") {
  const weight = planned.exercise.resistanceType === "WEIGHTED" && planned.weightGrams !== null
    ? ` · ${weightFromGrams(planned.weightGrams, weightUnit).toFixed(1)} ${weightUnit}`
    : "";
  return `${planned.setCount} 组 × ${targetLabel(planned.targetValue, planned.exercise.targetType)}${weight}`;
}

export function PlanEditor(props: PlanEditorProps) {
  const {
    plans,
    exercises,
    selectedPlanId,
    busy,
    progress,
    weightUnit,
    onSelectPlan,
    onCreatePlan,
    onRenamePlan,
    onUpdatePlanVisual,
    onSetArchived,
    onCreateDay,
    onUpdateDay,
    onDeleteDay,
    onAddPlannedExercise,
    onUpdatePlannedExercise,
    onDeletePlannedExercise,
    onStartWorkout,
  } = props;
  const [selectedDayId, setSelectedDayId] = useState("");
  const [isAddingPlannedExercise, setIsAddingPlannedExercise] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null;
  const selectedDay = selectedPlan?.workoutDays.find((day) => day.id === selectedDayId)
    ?? selectedPlan?.workoutDays[0]
    ?? null;
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;
  const progressFor = (planned: PlannedExercise) => progress.find((item) => item.plannedExerciseId === planned.id);

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await onCreatePlan(String(new FormData(form).get("name")));
    form.reset();
  }

  async function submitDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const weekday = String(data.get("suggestedWeekday"));
    await onCreateDay(selectedPlan, String(data.get("name")), weekday === "" ? null : Number(weekday));
    form.reset();
  }

  async function submitPlannedExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan || !selectedDay) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawWeight = data.get("weight");
    const hasWeight = typeof rawWeight === "string" && rawWeight.trim() !== "";
    await onAddPlannedExercise(selectedPlan, selectedDay, {
      exerciseId: selectedExerciseId,
      setCount: Number(data.get("setCount")),
      targetValue: Number(data.get("targetValue")),
      weight: hasWeight ? Number(rawWeight) : undefined,
      weightUnit: hasWeight ? weightUnit : undefined,
    });
    form.reset();
    setSelectedExerciseId("");
    setIsAddingPlannedExercise(false);
  }

  return (
    <section className="workspace-section" aria-labelledby="plans-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">训练计划</p>
          <h1 id="plans-title">安排训练日，定义每个动作的目标。</h1>
        </div>
        <p>训练开始时会锁定当前计划快照，之后修改计划不会改变历史。</p>
      </header>

      <form className="inline-create-form" onSubmit={submitPlan} data-testid="plan-form">
        <label>
          <span>新计划名称</span>
          <input name="name" placeholder="例如：力量基础" required maxLength={80} />
        </label>
        <button className="action-button primary" type="submit" disabled={busy}>创建计划</button>
      </form>

      {plans.length === 0 ? (
        <p className="empty-state">还没有训练计划。创建计划后，再添加训练日和动作。</p>
      ) : (
        <div className="plan-layout" data-testid="plan-editor">
          <aside className="plan-index" aria-label="训练计划列表">
            {plans.map((plan) => (
              <button
                className="plan-index-item"
                style={{ borderLeftColor: plan.accentColor === "ocean" ? "#7db7d6" : plan.accentColor === "clay" ? "#c58d78" : plan.accentColor === "slate" ? "#9aa4b0" : "#c2db86" }}
                type="button"
                key={plan.id}
                aria-current={plan.id === selectedPlan?.id ? "page" : undefined}
                onClick={() => {
                  setSelectedDayId("");
                  onSelectPlan(plan.id);
                }}
              >
                <strong>{plan.name}</strong>
                <span>{plan.workoutDays.length} 个训练日{plan.archivedAt !== null ? " · 已归档" : ""}</span>
              </button>
            ))}
          </aside>

          {selectedPlan && (
            <div className={`plan-detail plan-cover-${selectedPlan.coverKey}`}>
              <div className="plan-title-row">
                <div>
                  <p className="section-kicker">当前计划</p>
                  <h2>{selectedPlan.name}</h2>
                </div>
                <details className="inline-editor">
                  <summary>修改计划名</summary>
                  <form onSubmit={async (event) => {
                    event.preventDefault();
                    await onRenamePlan(selectedPlan, String(new FormData(event.currentTarget).get("name")));
                  }}>
                    <label>
                      <span>计划名称</span>
                      <input name="name" defaultValue={selectedPlan.name} required maxLength={80} />
                    </label>
                    <button className="action-button" type="submit" disabled={busy}>保存</button>
                  </form>
                </details>
                <button className="action-button quiet" type="button" disabled={busy} onClick={() => onSetArchived(selectedPlan, selectedPlan.archivedAt === null)}>{selectedPlan.archivedAt === null ? "归档计划" : "恢复计划"}</button>
              </div>
              <form className="inline-create-form compact" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onUpdatePlanVisual(selectedPlan, String(data.get("accentColor")), String(data.get("coverKey"))); }}>
                <label><span>主题色</span><select name="accentColor" defaultValue={selectedPlan.accentColor}><option value="sage">鼠尾草</option><option value="slate">石板</option><option value="clay">陶土</option><option value="ocean">海洋</option></select></label>
                <label><span>封面</span><select name="coverKey" defaultValue={selectedPlan.coverKey}><option value="strength">力量</option><option value="endurance">耐力</option><option value="mobility">灵活</option><option value="balance">平衡</option></select></label>
                <button className="action-button" type="submit" disabled={busy}>保存视觉</button>
              </form>

              <form className="inline-create-form compact" onSubmit={submitDay}>
                <label>
                  <span>训练日名称</span>
                  <input name="name" placeholder="例如：推日" required maxLength={80} />
                </label>
                <label>
                  <span>建议星期</span>
                  <select name="suggestedWeekday" defaultValue="">
                    <option value="">不指定</option>
                    {weekdays.map((label, index) => <option value={index} key={label}>{label}</option>)}
                  </select>
                </label>
                <button className="action-button primary" type="submit" disabled={busy}>添加训练日</button>
              </form>

              {selectedPlan.workoutDays.length === 0 ? (
                <p className="empty-state">这个计划还没有训练日。</p>
              ) : (
                <div className="day-layout">
                  <nav className="day-index" aria-label="训练日列表">
                    {selectedPlan.workoutDays.map((day) => (
                      <button
                        className="day-index-item"
                        type="button"
                        key={day.id}
                        aria-current={day.id === selectedDay?.id ? "page" : undefined}
                        onClick={() => setSelectedDayId(day.id)}
                      >
                        <strong>{day.name}</strong>
                        <span>{day.suggestedWeekday === null ? "任意日期" : weekdays[day.suggestedWeekday]}</span>
                      </button>
                    ))}
                  </nav>

                  {selectedDay && (
                    <div className="day-detail">
                      <div className="day-title-row">
                        <div>
                          <p className="section-kicker">训练日</p>
                          <h3>{selectedDay.name}</h3>
                          <p>{selectedDay.plannedExercises.length > 0 ? `${selectedDay.plannedExercises.length} 个动作` : "尚未安排动作"}</p>
                        </div>
                        <button className="action-button primary" type="button" disabled={busy || selectedDay.plannedExercises.length === 0 || selectedPlan.archivedAt !== null} onClick={() => onStartWorkout(selectedDay)}>
                          {selectedPlan.archivedAt === null ? "开始训练" : "计划已归档"}
                        </button>
                      </div>

                      <details className="day-settings">
                        <summary>训练日设置</summary>
                        <form className="inline-create-form compact" onSubmit={async (event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          const weekday = String(data.get("suggestedWeekday"));
                          await onUpdateDay(selectedPlan, selectedDay, String(data.get("name")), weekday === "" ? null : Number(weekday));
                        }}>
                          <label>
                            <span>训练日名称</span>
                            <input name="name" defaultValue={selectedDay.name} required maxLength={80} />
                          </label>
                          <label>
                            <span>建议星期</span>
                            <select name="suggestedWeekday" defaultValue={selectedDay.suggestedWeekday ?? ""}>
                              <option value="">不指定</option>
                              {weekdays.map((label, index) => <option value={index} key={label}>{label}</option>)}
                            </select>
                          </label>
                          <button className="action-button" type="submit" disabled={busy}>保存设置</button>
                          <button className="action-button danger" type="button" disabled={busy} onClick={() => onDeleteDay(selectedPlan, selectedDay)}>
                            删除训练日
                          </button>
                        </form>
                      </details>

                      <details className="day-settings planned-exercise-editor" open={isAddingPlannedExercise} onToggle={(event) => setIsAddingPlannedExercise(event.currentTarget.open)}>
                        <summary>添加动作</summary>
                        <form className="planned-form" onSubmit={submitPlannedExercise}>
                          <label>
                            <span>动作</span>
                            <select name="exerciseId" required value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)}>
                              <option value="" disabled>选择动作</option>
                              {exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}
                            </select>
                          </label>
                          {selectedExercise && <>
                            <label>
                              <span>组数</span>
                              <input name="setCount" type="number" min={1} defaultValue={3} required />
                            </label>
                            <label>
                              <span>{selectedExercise.targetType === "REPETITIONS" ? "目标次数" : "目标时长（秒）"}</span>
                              <input key={selectedExercise.targetType} name="targetValue" type="number" min={1} defaultValue={selectedExercise.targetType === "REPETITIONS" ? 8 : 30} required />
                            </label>
                            {selectedExercise.resistanceType === "WEIGHTED" && <label>
                              <span>重量 {weightUnit}</span>
                              <input name="weight" type="number" min={0.1} step={0.1} required />
                            </label>}
                          </>}
                          <button className="action-button primary" type="submit" disabled={busy || !selectedExercise}>添加动作</button>
                        </form>
                      </details>

                      <div className="planned-list">
                        {selectedDay.plannedExercises.length === 0 ? (
                          <p className="empty-state">从动作库选择一个动作，并填写统一组数、目标和重量。</p>
                        ) : selectedDay.plannedExercises.map((planned) => (
                          <article className="planned-row" key={planned.id}>
                            <div className="row-copy">
                              <h4>{planned.exercise.name}</h4>
                              <p>{plannedTarget(planned, weightUnit)}</p>
                              {progressFor(planned) && <p className="progress-copy">近 {progressFor(planned)?.recent.map((item) => `${item.date.slice(5)} ${item.achievementRate}%`).join(" · ")}{progressFor(planned)?.suggestion ? ` · ${progressFor(planned)?.suggestion}` : ""}</p>}
                            </div>
                            <div className="row-actions">
                              <details className="inline-editor">
                                <summary>编辑目标</summary>
                                <form onSubmit={async (event) => {
                                  event.preventDefault();
                                  const data = new FormData(event.currentTarget);
                                  const weightValue = String(data.get("weight"));
                                  await onUpdatePlannedExercise(selectedPlan, selectedDay, planned, {
                                    setCount: Number(data.get("setCount")),
                                    targetValue: Number(data.get("targetValue")),
                                    weight: weightValue ? Number(weightValue) : undefined,
                                    weightUnit: weightValue ? weightUnit : undefined,
                                  });
                                }}>
                                  <label>
                                    <span>组数</span>
                                    <input name="setCount" type="number" min={1} defaultValue={planned.setCount} required />
                                  </label>
                                  <label>
                                    <span>次数 / 秒数</span>
                                    <input name="targetValue" type="number" min={1} defaultValue={planned.targetValue} required />
                                  </label>
                                  <label>
                                    <span>重量 {weightUnit}</span>
                                    <input name="weight" type="number" min={0.1} step={0.1} defaultValue={planned.weightGrams === null ? "" : weightFromGrams(planned.weightGrams, weightUnit).toFixed(1)} />
                                  </label>
                                  <button className="action-button" type="submit" disabled={busy}>保存目标</button>
                                </form>
                              </details>
                              <button className="action-button danger" type="button" disabled={busy} onClick={() => onDeletePlannedExercise(selectedPlan, selectedDay, planned)}>
                                移除动作
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
