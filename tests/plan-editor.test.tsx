import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanEditor } from "../app/plan-editor";
import type { Exercise, ExerciseProgress, Plan } from "../app/workout-types";

const squat: Exercise = { id: "exercise-1", name: "杠铃深蹲", resistanceType: "WEIGHTED", targetType: "REPETITIONS", version: 1 };
const plank: Exercise = { id: "exercise-2", name: "平板支撑", resistanceType: "BODYWEIGHT", targetType: "DURATION", version: 1 };

function makePlan(): Plan {
  return {
    id: "plan-1",
    name: "力量基础",
    version: 1,
    archivedAt: null,
    workoutDays: [
      {
        id: "day-1",
        name: "推日",
        suggestedWeekday: 1,
        version: 1,
        position: 0,
        plannedExercises: [
          { id: "planned-1", exerciseId: squat.id, setCount: 3, targetValue: 8, weightGrams: 20000, version: 1, position: 0, exercise: squat },
          { id: "planned-2", exerciseId: plank.id, setCount: 2, targetValue: 45, weightGrams: null, version: 1, position: 1, exercise: plank },
        ],
      },
      { id: "day-2", name: "拉日", suggestedWeekday: null, version: 1, position: 1, plannedExercises: [] },
    ],
  };
}

function renderEditor(overrides: Partial<Parameters<typeof PlanEditor>[0]> = {}) {
  const handlers = {
    onSelectPlan: vi.fn(),
    onCreatePlan: vi.fn().mockResolvedValue(undefined),
    onRenamePlan: vi.fn().mockResolvedValue(undefined),
    onSetArchived: vi.fn().mockResolvedValue(undefined),
    onCreateDay: vi.fn().mockResolvedValue(undefined),
    onReorderDays: vi.fn().mockResolvedValue(undefined),
    onUpdateDay: vi.fn().mockResolvedValue(undefined),
    onDeleteDay: vi.fn().mockResolvedValue(undefined),
    onAddPlannedExercise: vi.fn().mockResolvedValue(undefined),
    onReorderPlannedExercises: vi.fn().mockResolvedValue(undefined),
    onUpdatePlannedExercise: vi.fn().mockResolvedValue(undefined),
    onDeletePlannedExercise: vi.fn().mockResolvedValue(undefined),
    onStartWorkout: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <PlanEditor
      plans={[makePlan()]}
      exercises={[squat, plank]}
      selectedPlanId="plan-1"
      busy={false}
      progress={[]}
      weightUnit="kg"
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PlanEditor", () => {
  it("renders the Day strip and the Planned Exercises of the current Workout Day", () => {
    renderEditor();

    const strip = document.querySelector(".day-strip") as HTMLElement;
    expect(within(strip).getByRole("button", { name: /推日/ })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: /拉日/ })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: /＋ 训练日/ })).toBeTruthy();
    expect(screen.getAllByTestId("planned-row")).toHaveLength(2);
  });

  it("keeps the chosen Workout Day per plan instead of resetting to the first Day", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Switch to the empty second Day via the chip strip, then collapse and re-open the plan:
    // the Day must stick instead of snapping back to the first one.
    const strip = document.querySelector(".day-strip") as HTMLElement;
    await user.click(within(strip).getByRole("button", { name: /拉日/ }));
    expect(screen.queryAllByTestId("planned-row")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /力量基础/ }));
    await user.click(screen.getByRole("button", { name: /力量基础/ }));
    expect(screen.queryAllByTestId("planned-row")).toHaveLength(0);
  });

  it("hides the reorder arrows until 调整顺序 is on, then sends the full ordered Day list", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    // The Workout Day rows live in the plan accordion, so open it before looking for arrows.
    await user.click(screen.getByRole("button", { name: /力量基础/ }));
    expect(screen.queryByRole("button", { name: /下移第 1 个训练日/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "调整顺序" }));
    await user.click(screen.getByRole("button", { name: /下移第 1 个训练日/ }));

    expect(handlers.onReorderDays).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-1" }), ["day-2", "day-1"]);
  });

  it("reorders Planned Exercises with the same full-list contract", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    await user.click(screen.getByRole("button", { name: "调整顺序" }));
    await user.click(screen.getByRole("button", { name: /下移 杠铃深蹲/ }));

    expect(handlers.onReorderPlannedExercises).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-1" }),
      expect.objectContaining({ id: "day-1" }),
      ["planned-2", "planned-1"],
    );
  });

  it("asks through its own dialog before deleting a Workout Day", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    await user.click(screen.getByRole("button", { name: "删除训练日" }));
    expect(handlers.onDeleteDay).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("删除「推日」？")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(handlers.onDeleteDay).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-1" }), expect.objectContaining({ id: "day-1" }));
  });

  it("cancelling the dialog leaves the Workout Day alone", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    await user.click(screen.getByRole("button", { name: "删除训练日" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(handlers.onDeleteDay).not.toHaveBeenCalled();
  });

  it("explains why 开始训练 is unavailable instead of showing a dead button", () => {
    const archived = makePlan();
    archived.archivedAt = "2026-09-16T00:00:00.000Z";
    renderEditor({ plans: [archived] });

    expect(screen.getByText("计划已归档，恢复后才能开始训练。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^开始「/ })).toBeNull();
  });

  it("adds a Planned Exercise by searching the library instead of a select", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    await user.click(screen.getByRole("button", { name: "＋ 添加动作" }));
    await user.type(screen.getByPlaceholderText(/输入名称筛选/), "平板");
    await user.click(screen.getByRole("button", { name: /平板支撑/ }));
    await user.click(screen.getByRole("button", { name: "加进这个训练日" }));

    expect(handlers.onAddPlannedExercise).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-1" }),
      expect.objectContaining({ id: "day-1" }),
      { exerciseId: "exercise-2", setCount: 3, targetValue: 10, weight: undefined, weightUnit: undefined },
    );
  });

  it("summarises progress behind a collapsed recap instead of a raw sentence", async () => {
    const user = userEvent.setup();
    const progress: ExerciseProgress[] = [
      {
        workoutPlanId: "plan-1",
        plannedExerciseId: "planned-1",
        exerciseId: "exercise-1",
        recent: [
          { date: "2026-09-10", achievementRate: 100, excessTargetValue: 0, excessWeightGrams: 0 },
          { date: "2026-09-14", achievementRate: 80, excessTargetValue: 0, excessWeightGrams: 0 },
        ],
        progressionSuggestion: true,
        suggestion: "把目标提高到 9 次。",
      },
    ];
    renderEditor({ progress });

    const recap = screen.getAllByText(/最近 80%/)[0].closest("details") as HTMLDetailsElement;
    expect(recap.open).toBe(false);

    await user.click(within(recap).getByText(/最近 80%/));
    expect(within(recap).getByText("09-14")).toBeTruthy();
    expect(within(recap).getByText("达成 80%")).toBeTruthy();
    expect(within(recap).getByText("进阶建议：把目标提高到 9 次。")).toBeTruthy();
  });

  it("renames the plan inline without a separate form section", async () => {
    const user = userEvent.setup();
    const handlers = renderEditor();

    await user.click(screen.getByRole("button", { name: "修改计划名称" }));
    const input = screen.getByLabelText("计划名称");
    await user.clear(input);
    await user.type(input, "推拉腿");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(handlers.onRenamePlan).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-1" }), "推拉腿");
  });
});
