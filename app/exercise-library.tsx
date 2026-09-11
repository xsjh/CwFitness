"use client";

import { FormEvent } from "react";
import type { Exercise, ResistanceType, TargetType } from "./workout-types";

export type NewExerciseInput = {
  name: string;
  resistanceType: ResistanceType;
  targetType: TargetType;
};

type ExerciseLibraryProps = {
  exercises: Exercise[];
  busy: boolean;
  onCreate: (input: NewExerciseInput) => Promise<void>;
  onRename: (exercise: Exercise, name: string) => Promise<void>;
  onDelete: (exercise: Exercise) => Promise<void>;
};

function typeLabel(exercise: Exercise) {
  const resistance = exercise.resistanceType === "WEIGHTED" ? "负重" : "自重";
  const target = exercise.targetType === "REPETITIONS" ? "次数" : "时长";
  return `${resistance} · ${target}`;
}

export function ExerciseLibrary({ exercises, busy, onCreate, onRename, onDelete }: ExerciseLibraryProps) {
  async function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await onCreate({
      name: String(data.get("name")),
      resistanceType: String(data.get("resistanceType")) as ResistanceType,
      targetType: String(data.get("targetType")) as TargetType,
    });
  }

  return (
    <section className="workspace-section" aria-labelledby="exercise-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">动作库</p>
          <h1 id="exercise-title">定义你在训练中记录的动作。</h1>
        </div>
        <p>动作只保留稳定身份和记录类型，目标值属于每个训练日。</p>
      </header>

      <form className="toolbar-form" onSubmit={submitNew}>
        <label>
          <span>动作名称</span>
          <input name="name" placeholder="例如：杠铃深蹲" required maxLength={80} />
        </label>
        <label>
          <span>负重方式</span>
          <select name="resistanceType" defaultValue="WEIGHTED">
            <option value="WEIGHTED">负重</option>
            <option value="BODYWEIGHT">自重</option>
          </select>
        </label>
        <label>
          <span>记录指标</span>
          <select name="targetType" defaultValue="REPETITIONS">
            <option value="REPETITIONS">次数</option>
            <option value="DURATION">秒数</option>
          </select>
        </label>
        <button className="action-button primary" type="submit" disabled={busy}>新建动作</button>
      </form>

      <div className="exercise-list" data-testid="exercise-list">
        {exercises.length === 0 ? (
          <p className="empty-state">动作库还是空的。先创建一个动作，再把它放进训练日。</p>
        ) : exercises.map((exercise) => (
          <article className="exercise-row" key={exercise.id}>
            <div className="row-copy">
              <h2>{exercise.name}</h2>
              <p>{typeLabel(exercise)}</p>
            </div>
            <div className="row-actions">
              <details className="inline-editor">
                <summary>改名</summary>
                <form onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const name = String(new FormData(form).get("name"));
                  await onRename(exercise, name);
                  form.closest("details")?.removeAttribute("open");
                }}>
                  <label>
                    <span>新名称</span>
                    <input name="name" defaultValue={exercise.name} required maxLength={80} />
                  </label>
                  <button className="action-button" type="submit" disabled={busy}>保存名称</button>
                </form>
              </details>
              <button className="action-button danger" type="button" disabled={busy} onClick={() => onDelete(exercise)}>
                永久删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
