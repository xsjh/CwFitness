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
 * jsdom reports every rect as zero, and dnd-kit decides which card is over which from those rects —
 * so without a layout every drag resolves the same way and the tests prove nothing. This installs
 * one that behaves like the real grid: each card reports the box its *position in the DOM* earns it,
 * so the stub stays in step with the arrangement as the drag rearranges cards.
 *
 * The alternative — writing coordinates onto each card once — freezes the layout at press time, and
 * a drag measured against those frozen boxes can never see its own swaps.
 */
const CARD_SIZE = { width: 80, height: 60 };
const CARD_GAP = 20;
const STRIDE = CARD_SIZE.width + CARD_GAP;
/**
 * Where the grid starts, in page coordinates.
 *
 * Not zero: the real list sits inside the page's own margins, so its cards are never at the viewport
 * origin, and a layout laid out from zero is one arrangement the real page never produces. Nothing
 * here is load-bearing — the point is only that the stub looks like something the page could show.
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
 * How far the pointer has to travel before the card is picked up. Mirrors the component's own
 * threshold: the tests have to cross it, not restate what it is.
 */
const DRAG_ACTIVATION_DISTANCE = 8;

/**
 * Drives a press on a card, carries it `slots` cells to the right (negative for left) and `rows`
 * cells down, then releases.
 *
 * The movement is expressed in cells because the question being asked is which card ends up over
 * which, and dnd-kit answers that from the rectangles the cards report — so the stub layout above is
 * what makes the outcome knowable at all.
 */
async function dragCard(handle: HTMLElement, slots: number, rows = 0) {
  const from = handle.getBoundingClientRect();
  const startX = from.left + 4;
  const startY = from.top + 4;
  await pressAndCarry(handle, startX, startY, startX + slots * STRIDE, startY + rows * STRIDE);
}

/** A part-cell carry, for the cases that need to land short of a full cell. */
async function dragCardBy(handle: HTMLElement, dx: number, dy = 0) {
  const from = handle.getBoundingClientRect();
  const startX = from.left + 4;
  const startY = from.top + 4;
  await pressAndCarry(handle, startX, startY, startX + dx, startY + dy);
}

/**
 * Press, cross the activation threshold, travel to the destination, release.
 *
 * The extra move at the start is not decoration: a card is not picked up until the pointer has
 * travelled far enough, which is the very behaviour that keeps a press on the ✎ summary from
 * starting a carry instead of opening its popover.
 *
 * jsdom has no `PointerEvent`, so these are plain bubbling events carrying the fields dnd-kit reads
 * off them. They go to the document because that is where the library listens once a drag is live.
 */
async function pressAndCarry(handle: HTMLElement, startX: number, startY: number, endX: number, endY: number) {
  fireEvent.pointerDown(handle, { button: 0, clientX: startX, clientY: startY, isPrimary: true, pointerId: 1 });
  fireEvent(document, pointerMove(startX + DRAG_ACTIVATION_DISTANCE + 2, startY));
  await act(async () => { await Promise.resolve(); });
  fireEvent(document, pointerMove(endX, endY));
  await act(async () => { await Promise.resolve(); });
  fireEvent.pointerUp(document, { clientX: endX, clientY: endY, isPrimary: true, pointerId: 1 });
  await act(async () => { await Promise.resolve(); });
}

function pointerMove(clientX: number, clientY: number) {
  return Object.assign(new Event("pointermove", { bubbles: true }), { clientX, clientY, isPrimary: true, pointerId: 1 });
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

  it("swaps a card with the neighbour it is carried past, and not before", async () => {
    // Just under half a cell leaves the neighbour nearest, so nothing moves; just over half puts the
    // carried card nearer the neighbour's centre, and the two trade places. Asserting both sides is
    // what pins the outcome to the halfway point rather than to "somewhere past a card".
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

  it("leaves no trace of the drag behind once the card is released", async () => {
    // A carried card wears a transform for as long as it is in the air, and a marker that says so.
    // Both have to come off on release, or the card stays parked beside the place the list says it
    // occupies, still wearing the raised styling of a gesture that ended.
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

  it("keeps a press on a control inside the card a click rather than a drag", async () => {
    const handlers = renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    // The whole card is the handle, so a press that lands on a control has to stay a click — or the
    // ✎ popover would open and the card would be carried off on the same gesture. What separates the
    // two is travel: the sensor does not arm until the pointer has moved.
    const edit = within(cards()[0]).getByLabelText(/编辑 杠铃深蹲/);
    const at = cards()[0].getBoundingClientRect();
    const x = at.left + 4;
    const y = at.top + 4;
    fireEvent.pointerDown(edit, { button: 0, clientX: x, clientY: y, isPrimary: true, pointerId: 1 });
    fireEvent.pointerUp(document, { clientX: x, clientY: y, isPrimary: true, pointerId: 1 });
    await act(async () => { await Promise.resolve(); });

    expect(handlers.onReorderPlannedExercises).not.toHaveBeenCalled();
  });

  it("shows the slot lattice only while a card is being carried", async () => {
    renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    const list = document.querySelector(".ex-list") as HTMLElement;
    expect(list.dataset.draggingGrid).toBeUndefined();

    const at = cards()[0].getBoundingClientRect();
    const x = at.left + 4;
    const y = at.top + 4;
    fireEvent.pointerDown(cards()[0], { button: 0, clientX: x, clientY: y, isPrimary: true, pointerId: 1 });

    // A press is not yet a carry, and the lattice is a picture of where a card may be dropped — it
    // has no business appearing while no card is in the air.
    expect(list.dataset.draggingGrid).toBeUndefined();

    fireEvent(document, pointerMove(x + DRAG_ACTIVATION_DISTANCE + 2, y));
    await act(async () => { await Promise.resolve(); });
    expect(list.dataset.draggingGrid).toBe("true");

    fireEvent.pointerUp(document, { clientX: x + DRAG_ACTIVATION_DISTANCE + 2, clientY: y, isPrimary: true, pointerId: 1 });
    await act(async () => { await Promise.resolve(); });
    expect(list.dataset.draggingGrid).toBeUndefined();
  });

  it("clears the carried card's own translucency for the duration of the carry", async () => {
    // A carried card used to sit at .92 opacity, which read as a dim copy rather than the card you
    // are holding. It now goes fully opaque, and comes back on release — asserted through the
    // marker, which is what the stylesheet keys off.
    renderEditor();
    const cards = () => screen.getAllByTestId("planned-row");
    stubCardLayout();

    const at = cards()[0].getBoundingClientRect();
    const x = at.left + 4;
    const y = at.top + 4;
    fireEvent.pointerDown(cards()[0], { button: 0, clientX: x, clientY: y, isPrimary: true, pointerId: 1 });
    expect(cards()[0].dataset.dragging).toBeUndefined();

    fireEvent(document, pointerMove(x + DRAG_ACTIVATION_DISTANCE + 2, y));
    await act(async () => { await Promise.resolve(); });
    expect(cards()[0].dataset.dragging).toBe("true");

    fireEvent.pointerUp(document, { clientX: x + DRAG_ACTIVATION_DISTANCE + 2, clientY: y, isPrimary: true, pointerId: 1 });
    await act(async () => { await Promise.resolve(); });
    expect(cards()[0].dataset.dragging).toBeUndefined();
  });
});
