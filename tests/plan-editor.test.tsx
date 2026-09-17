import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

/**
 * jsdom reports every rect as zero, so the drag's lattice has nothing to read. This installs a
 * layout that behaves like the real grid: each card reports the box its *position in the DOM*
 * earns it, so the stub stays in step with the arrangement as the drag swaps cards around.
 *
 * The alternative — writing coordinates onto each card once — freezes the layout at press time, and
 * a drag that measures those frozen boxes can never see its own swaps.
 */
const CARD_SIZE = { width: 80, height: 60 };
const CARD_GAP = 20;
const STRIDE = CARD_SIZE.width + CARD_GAP;
/**
 * Where the grid actually starts, in page coordinates.
 *
 * Deliberately not zero, and deliberately not a multiple of `STRIDE`: the real list sits inside the
 * page's own margins, so its cells are at things like 438 and 663. A layout stubbed from the origin
 * puts the cells exactly on `round(value / STRIDE) * STRIDE`, which is the one arrangement where a
 * snap measured from zero and a snap measured from the first cell agree — and a test written on it
 * cannot tell the two apart.
 */
const GRID_ORIGIN = { left: 38, top: 17 };

function stubCardLayout() {
  const cards = () => screen.getAllByTestId("planned-row");
  cards().forEach((card) => {
    card.getBoundingClientRect = () => {
      const index = cards().indexOf(card);
      const left = GRID_ORIGIN.left + Math.max(index, 0) * STRIDE;
      const top = GRID_ORIGIN.top;
      return { left, top, right: left + CARD_SIZE.width, bottom: top + CARD_SIZE.height, width: CARD_SIZE.width, height: CARD_SIZE.height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    };
  });
}

/**
 * Drives a press on a card, carries it `slots` cells to the right (negative for left) and `rows`
 * cells down, then releases.
 *
 * The distance is measured in cells rather than pixels because that is the unit the drag works in:
 * the card keeps whatever grab offset the press gave it, so what decides the outcome is how far the
 * pointer travelled. Naming the movement in the pointer's own coordinates is also what makes the
 * test independent of where inside the card it happened to be grabbed.
 */
async function dragCard(handle: HTMLElement, slots: number, rows = 0) {
  const from = handle.getBoundingClientRect();
  const startX = from.left + 4;
  const startY = from.top + 4;

  fireEvent.pointerDown(handle, { button: 0, clientX: startX, clientY: startY });
  // jsdom has no PointerEvent, so these are plain events on the document — which is exactly where
  // the component listens for them.
  const dropX = startX + slots * STRIDE;
  const dropY = startY + rows * STRIDE;
  fireEvent(document, pointerMove(dropX, dropY));
  fireEvent.pointerUp(document, { clientX: dropX, clientY: dropY });
  await act(async () => { await Promise.resolve(); });
}

/** A part-cell carry, for the cases that need to land short of a full snap. */
async function dragCardBy(handle: HTMLElement, dx: number, dy = 0) {
  const from = handle.getBoundingClientRect();
  const startX = from.left + 4;
  const startY = from.top + 4;

  fireEvent.pointerDown(handle, { button: 0, clientX: startX, clientY: startY });
  fireEvent(document, pointerMove(startX + dx, startY + dy));
  fireEvent.pointerUp(document, { clientX: startX + dx, clientY: startY + dy });
  await act(async () => { await Promise.resolve(); });
}

function pointerMove(clientX: number, clientY: number) {
  return Object.assign(new Event("pointermove", { bubbles: true }), { clientX, clientY });
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

  it("reorders Planned Exercises by dragging one card onto another's slot", async () => {
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    // Card 2 starts in column 1 and is carried one cell left, into the cell card 1 owns. The two
    // trade slots, so card 2 now leads.
    await dragCard(cards()[1], -1);

    expect(handlers.onReorderPlannedExercises).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-1" }),
      expect.objectContaining({ id: "day-1" }),
      ["planned-2", "planned-1"],
    );
  });

  it("snaps a card to the nearest slot instead of leaving it between two", async () => {
    // Just under half a cell rounds back to where the card started; just over half rounds on to the
    // next column and the two cards trade places. Asserting both sides is what pins the snap to the
    // halfway rule rather than to "somewhere past a card".
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    await dragCardBy(cards()[1], -Math.round(STRIDE * 0.45));
    expect(handlers.onReorderPlannedExercises, "just under half a cell is short of the snap").not.toHaveBeenCalled();

    await dragCardBy(cards()[1], -Math.round(STRIDE * 0.55));
    expect(handlers.onReorderPlannedExercises, "just over half a cell crosses into the next column").toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ["planned-2", "planned-1"],
    );
  });

  it("lands the carried card on a real cell of the list, not on a multiple of the cell pitch", async () => {
    // The list is inset by the page's margins, so its cells are not at 0, STRIDE, 2 * STRIDE … A snap
    // that measures from zero instead of from the first cell has nothing to put the card on until the
    // pointer is half a cell away, and then leaves it a fraction of a cell off — a card parked
    // between two cells while the outline under it says it is on one.
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    await dragCardBy(cards()[1], -Math.round(STRIDE * 0.6));

    // The card was carried exactly one cell, so it owns the leading cell the way it would have if the
    // pointer had gone a whole cell: the order changed, and the transform the snap left on the card
    // is expressed against that cell and is retracted on release, leaving nothing behind.
    expect(handlers.onReorderPlannedExercises).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ["planned-2", "planned-1"],
    );
    expect(cards().map((card) => card.style.transform)).toEqual(["", ""]);
  });

  it("leaves no trace of the drag behind once the card is released", async () => {
    // The carried card is positioned by a transform that holds it under the pointer. If that is not
    // retracted on release the card stays parked beside the slot the list says it is in, and the
    // next gesture measures its origin from there.
    renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    await dragCard(cards()[1], -1);

    expect(cards().map((card) => card.style.transform)).toEqual(["", ""]);
    expect(cards().map((card) => card.dataset.dragging ?? "")).toEqual(["", ""]);
  });

  it("keeps a card in place when the pointer stays on its own slot", async () => {
    // A fifth of a cell is short of the halfway point, so the snap rounds back to the slot the card
    // came from and nothing has to move.
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    await dragCardBy(cards()[0], Math.round(STRIDE * 0.2));

    expect(handlers.onReorderPlannedExercises).not.toHaveBeenCalled();
  });

  it("does not start a drag from a control inside the card", async () => {
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    // Pressing the edit summary has to stay a click; a press that lands on a control must not be
    // promoted into a reorder, or the popover would open and close on the same gesture.
    await dragCard(within(cards()[0]).getByLabelText(/编辑 杠铃深蹲/), 1);

    expect(handlers.onReorderPlannedExercises).not.toHaveBeenCalled();
  });

  it("shows the slot lattice only while a card is being carried", async () => {
    renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    const list = document.querySelector(".ex-list") as HTMLElement;
    expect(list.dataset.draggingGrid).toBeUndefined();

    fireEvent.pointerDown(cards()[0], { button: 0, clientX: 4, clientY: 4 });
    expect(list.dataset.draggingGrid).toBe("true");

    fireEvent.pointerUp(document, { clientX: 4, clientY: 4 });
    await act(async () => { await Promise.resolve(); });
    expect(list.dataset.draggingGrid).toBeUndefined();
  });
});
