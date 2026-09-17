"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  onSetArchived: (plan: Plan, archived: boolean) => Promise<void>;
  onCreateDay: (plan: Plan, name: string, suggestedWeekday: number | null) => Promise<void>;
  onReorderDays: (plan: Plan, dayIds: string[]) => Promise<void>;
  onUpdateDay: (plan: Plan, day: WorkoutDay, name: string, suggestedWeekday: number | null) => Promise<void>;
  onDeleteDay: (plan: Plan, day: WorkoutDay) => Promise<void>;
  onAddPlannedExercise: (plan: Plan, day: WorkoutDay, input: PlannedExerciseInput) => Promise<void>;
  onReorderPlannedExercises: (plan: Plan, day: WorkoutDay, plannedExerciseIds: string[]) => Promise<void>;
  onUpdatePlannedExercise: (plan: Plan, day: WorkoutDay, planned: PlannedExercise, input: Omit<PlannedExerciseInput, "exerciseId">) => Promise<void>;
  onDeletePlannedExercise: (plan: Plan, day: WorkoutDay, planned: PlannedExercise) => Promise<void>;
  onStartWorkout: (day: WorkoutDay) => Promise<void>;
};

type PendingDeletion =
  | { kind: "day"; title: string; impact: string; run: () => Promise<void> }
  | { kind: "planned"; title: string; impact: string; run: () => Promise<void> };

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function weekdayLabel(value: number | null) {
  return value === null ? "不限日期" : weekdays[value];
}

function weightLabel(planned: PlannedExercise, weightUnit: "kg" | "lb") {
  return planned.exercise.resistanceType === "WEIGHTED" && planned.weightGrams !== null
    ? weightFromGrams(planned.weightGrams, weightUnit).toFixed(1)
    : null;
}

/** Returns a new array with one item moved, or `null` when the move would fall outside. */
function moved(list: string[], from: number, to: number) {
  if (to < 0 || to >= list.length) return null;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** The cards currently on screen, in DOM order — which is always the arrangement being shown. */
function plannedCards() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="planned-row"]'));
}

/**
 * The lattice the cards are laid out on, read off the cards themselves rather than off the
 * stylesheet: the list is a grid of equal cells, so the step from one column to the next is the
 * distance between two cards sitting side by side, and likewise down a column.
 *
 * The two steps are not the same number — a cell is as wide as a card plus the gutter, and as tall
 * as a card plus the gutter, and those are different because cards are wider than they are tall —
 * so they are derived separately. `null` means there is only one of that axis on screen, leaving
 * nothing to take a step from.
 *
 * The steps are carried alongside the *rhythm* rather than the origin: where the first cell sits is
 * `columns[0]`, and it is deliberately not folded into the step. A grid whose origin is the
 * viewport's zero is a grid the cells may not sit on at all — the list is inset by the page's own
 * margins, so `left` values are things like 438 and 663, and a snap of `round(643 / 225) * 225` lands
 * on 675, a position no card has ever occupied.
 */
type Lattice = { columns: number[]; rows: number[]; columnStep: number | null; rowStep: number | null };

function readLattice(rects: (DOMRect | null)[]): Lattice {
  const positions = (pick: (rect: DOMRect) => number) => {
    const values = rects.filter((rect): rect is DOMRect => rect !== null).map((rect) => Math.round(pick(rect)));
    return [...new Set(values)].sort((a, b) => a - b);
  };
  const stepOf = (values: number[]) => {
    if (values.length < 2) return null;
    // The smallest gap is one cell. Taking the minimum rather than the average keeps the step right
    // when the pointer moves over a row or column that is only partly filled.
    let step = Infinity;
    for (let index = 1; index < values.length; index += 1) step = Math.min(step, values[index] - values[index - 1]);
    return step > 0 ? step : null;
  };
  const columns = positions((rect) => rect.left);
  const rows = positions((rect) => rect.top);
  return { columns, rows, columnStep: stepOf(columns), rowStep: stepOf(rows) };
}

/**
 * Rounds a carried card back onto the lattice. The card follows the cursor, then snaps to the
 * nearest cell, so it always settles in a slot instead of floating in a gap between two.
 *
 * Measured from the first cell rather than from the origin, because the cells are not required to be
 * spaced from zero: `round((643 - 438) / 225) * 225 + 438` is 438, whereas snapping the raw value
 * lands on 675 and puts the card between two cells.
 *
 * An axis with no step to snap to — a single column, or a list short enough to be one row — is left
 * alone rather than snapped to zero, which would drag the card to the origin.
 */
function snapToGrid(left: number, top: number, lattice: Lattice) {
  const snap = (value: number, step: number | null, cells: number[]) => {
    if (step === null || cells.length === 0) return value;
    const base = cells[0];
    return Math.round((value - base) / step) * step + base;
  };
  return { left: snap(left, lattice.columnStep, lattice.columns), top: snap(top, lattice.rowStep, lattice.rows) };
}

/** Where a resting card sits, per card, in viewport coordinates and lattice units. */
type DragOrigin = { left: number; top: number; column: number; row: number };

/**
 * Records where every card rests and which cell of the lattice each one owns. Read once per
 * gesture: from that point on the resting cards only move by `transform`, and their boxes in the
 * DOM keep describing the layout they started in.
 */
function readOrigins(rects: (DOMRect | null)[], lattice: Lattice) {
  return rects.map<DragOrigin | null>((rect) => {
    if (rect === null) return null;
    return {
      left: rect.left,
      top: rect.top,
      column: lattice.columns.indexOf(Math.round(rect.left)),
      row: lattice.rows.indexOf(Math.round(rect.top)),
    };
  });
}

/**
 * The card standing in a given lattice cell, or null when the cell is free. This is what the
 * carried card trades places with: they swap, so no card ever leaves the list and the rest keep the
 * cells they were already in.
 */
function coveredOrigin(origins: (DragOrigin | null)[], skip: number, column: number, row: number) {
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index];
    if (origin === null || index === skip) continue;
    if (origin.column === column && origin.row === row) return { index, origin };
  }
  return null;
}

/**
 * Draws the lattice as `background-image`s rather than as elements: one outline per slot, painted
 * over the whole list. Two reasons it is not a sibling element — an overlay would either swallow
 * the pointer or need `pointer-events:none`, which the accessibility suite reads as a control that
 * only shows on hover; and a per-cell element would add a box per slot for that same suite to
 * collide-check. An outline is also literally "where the card will land", so the snap reads as the
 * card settling onto the line.
 *
 * Each layer is written as longhands rather than as the `background` shorthand: the shorthand's
 * `<position>/<size>` syntax is rejected when the layers are set through `style` one property at a
 * time, and the whole grid silently fails to paint. The stroke is likewise a literal rather than
 * `var(--line-soft)`, which cannot resolve inside a shorthand layer — it has to be kept in step
 * with the token by hand.
 *
 * The stroke is brighter than the resting card border on purpose. The outline sits *outside* the
 * card it belongs to, so during a carry it is competing with the card's own border for the same
 * pixels; a tone at the token's weight reads as a doubled edge and disappears once a card has moved
 * onto it. `GRID_INSET` is the gap that keeps the two edges as separate lines.
 */
const GRID_STROKE = "rgba(255,255,255,.2)";
const GRID_INSET = 7;

function gridLayers(boxes: { left: number; top: number; width: number; height: number }[]) {
  return {
    image: boxes.map(() => `linear-gradient(${GRID_STROKE},${GRID_STROKE})`).join(","),
    position: boxes.map((box) => `${Math.round(box.left + GRID_INSET)}px ${Math.round(box.top + GRID_INSET)}px`).join(","),
    size: boxes.map((box) => `${Math.round(box.width - GRID_INSET * 2)}px ${Math.round(box.height - GRID_INSET * 2)}px`).join(","),
    repeat: boxes.map(() => "no-repeat").join(","),
  };
}

function meterBars(recent: ExerciseProgress["recent"]) {
  return recent.map((entry, index) => {
    const state = entry.achievementRate >= 100 ? "on" : entry.achievementRate >= 80 ? "hi" : "lo";
    return (
      <i
        className={state}
        key={`${entry.date}-${index}`}
        style={{ height: `${Math.max(5, Math.round((entry.achievementRate / 100) * 14))}px` }}
      />
    );
  });
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
    onSetArchived,
    onCreateDay,
    onReorderDays,
    onUpdateDay,
    onDeleteDay,
    onAddPlannedExercise,
    onReorderPlannedExercises,
    onUpdatePlannedExercise,
    onDeletePlannedExercise,
    onStartWorkout,
  } = props;

  // Which Workout Day the user was last looking at, remembered per Workout Plan so switching
  // back and forth does not throw away the Day they were on.
  const [dayByPlan, setDayByPlan] = useState<Record<string, string>>({});
  const [expandedPlanId, setExpandedPlanId] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [sortMode, setSortMode] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isAddingDay, setIsAddingDay] = useState(false);
  const [isAddingPlannedExercise, setIsAddingPlannedExercise] = useState(false);
  const [isRenamingPlan, setIsRenamingPlan] = useState(false);
  const [editingPlannedId, setEditingPlannedId] = useState("");
  const [openRecapId, setOpenRecapId] = useState("");
  const [search, setSearch] = useState("");
  const [pickedExerciseId, setPickedExerciseId] = useState("");
  // One piece of state drives the whole drag: `id` is the card under the pointer (live from press
  // to release), and `slot` is the index of the resting card whose lattice cell the carried card is
  // currently sitting in, or -1 when it is over a cell nobody owns. Nothing reads `slot` from the
  // render — the swap it drives happens straight in the DOM — so it exists only to keep the last
  // state of the gesture alive across re-renders.
  const [drag, setDrag] = useState<{ id: string; slot: number } | null>(null);
  // The lattice is drawn by an effect rather than by the JSX because it is a picture of where the
  // cards actually are, and that is only knowable once layout has run.
  const listRef = useRef<HTMLDivElement | null>(null);
  const gridShown = useRef(false);
  // Read inside the drag effect but written by every press, so it lives in a ref: re-rendering on
  // each pointer move would make the card lag behind the cursor.
  const pointerAt = useRef({ x: 0, y: 0 });
  // The drag effect is only torn down on pointer-up, so it holds a stale `selectedDay` from the
  // moment the gesture began. Reading the live pair from a ref keeps the committed order correct.
  const reorderTarget = useRef<{ plan: Plan; day: WorkoutDay } | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

  const activePlans = plans.filter((plan) => plan.archivedAt === null);
  const archivedPlans = plans.filter((plan) => plan.archivedAt !== null);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null;
  const selectedDay = selectedPlan?.workoutDays.find((day) => day.id === dayByPlan[selectedPlan.id])
    ?? selectedPlan?.workoutDays[0]
    ?? null;
  const progressFor = (planned: PlannedExercise) => progress.find((item) => item.plannedExerciseId === planned.id);
  // The drag effect holds whatever `selectedDay` was when the gesture began, so it reads the pair
  // it should commit against from here instead. An effect rather than an assignment during render,
  // because a render can be discarded and this has to happen exactly once per committed render.
  useEffect(() => {
    reorderTarget.current = selectedPlan !== null && selectedDay !== null ? { plan: selectedPlan, day: selectedDay } : null;
  }, [selectedPlan, selectedDay]);

  // The lattice lives only for the length of a gesture: painted when a card is picked up, wiped
  // when it is let go. It is written straight to the element instead of through `style` in the
  // JSX on purpose — the boxes it draws come from layout, so putting it in the JSX would mean
  // measuring during render and re-rendering to show the result, on every gesture.
  //
  // This runs on the press and on every rearrangement, which is exactly when the lattice can
  // change: cards only ever move between slots, so the outlines are the same set in the same
  // places until one does. `paintGrid` is shared with the drag effect, which owns the measurement.
  const paintGrid = useCallback(() => {
    const list = listRef.current;
    if (list === null) return;
    const cards = plannedCards();
    if (cards.length === 0) return;
    const listBox = list.getBoundingClientRect();
    // The cards are drawn as an outline each: the gaps between them are exactly what the lattice is
    // there to reveal, and a box under a resting card would be hidden by it.
    const boxes = cards
      .map((card) => card.getBoundingClientRect())
      .map((rect) => ({ left: rect.left - listBox.left, top: rect.top - listBox.top, width: rect.width, height: rect.height }));
    if (boxes.some((box) => box.width <= 0)) return;
    const layers = gridLayers(boxes);
    list.style.backgroundImage = layers.image;
    list.style.backgroundPosition = layers.position;
    list.style.backgroundSize = layers.size;
    list.style.backgroundRepeat = layers.repeat;
    gridShown.current = true;
  }, []);

  const clearGrid = useCallback(() => {
    const list = listRef.current;
    if (list === null || !gridShown.current) return;
    list.style.backgroundImage = "";
    list.style.backgroundPosition = "";
    list.style.backgroundSize = "";
    list.style.backgroundRepeat = "";
    gridShown.current = false;
  }, []);

  // `selectedPlanId` is owned by the workspace, so it can change without the rail being told
  // (creating a plan selects it, restoring a backup replaces every id). Derive the open row
  // during render so the rail can never disagree with the detail column.
  const openPlanId = expandedPlanId !== "" && expandedPlanId !== selectedPlan?.id ? "" : expandedPlanId;

  function resetDayContext() {
    setIsAddingDay(false);
    setIsAddingPlannedExercise(false);
    setEditingPlannedId("");
    setPickedExerciseId("");
    setSearch("");
    // A gesture that never got its pointer-up (the Day was switched from the keyboard, or the list
    // was rebuilt under it) would otherwise leave the card frozen in its carried state.
    setDrag(null);
  }

  function selectPlan(planId: string) {
    resetDayContext();
    setIsRenamingPlan(false);
    if (planId !== selectedPlan?.id) onSelectPlan(planId);
    setExpandedPlanId((current) => (current === planId ? "" : planId));
  }

  function selectDay(dayId: string) {
    if (!selectedPlan) return;
    resetDayContext();
    setDayByPlan((current) => ({ ...current, [selectedPlan.id]: dayId }));
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name"));
    form.reset();
    await onCreatePlan(name);
    setIsCreatingPlan(false);
  }

  async function submitDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const weekday = String(data.get("weekday"));
    form.reset();
    await onCreateDay(selectedPlan, String(data.get("name")), weekday === "" ? null : Number(weekday));
    setIsAddingDay(false);
  }

  async function submitPlannedExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan || !selectedDay) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawWeight = data.get("weight");
    const hasWeight = typeof rawWeight === "string" && rawWeight.trim() !== "";
    form.reset();
    await onAddPlannedExercise(selectedPlan, selectedDay, {
      exerciseId: pickedExerciseId,
      setCount: Number(data.get("setCount")),
      targetValue: Number(data.get("targetValue")),
      weight: hasWeight ? Number(rawWeight) : undefined,
      weightUnit: hasWeight ? weightUnit : undefined,
    });
    setPickedExerciseId("");
    setIsAddingPlannedExercise(false);
    setSearch("");
  }

  function moveDay(index: number, delta: number) {
    if (!selectedPlan) return;
    const next = moved(selectedPlan.workoutDays.map((day) => day.id), index, index + delta);
    if (next) void onReorderDays(selectedPlan, next);
  }

  function movePlannedExercise(index: number, delta: number) {
    if (!selectedPlan || !selectedDay) return;
    const next = moved(selectedDay.plannedExercises.map((planned) => planned.id), index, index + delta);
    if (next) void onReorderPlannedExercises(selectedPlan, selectedDay, next);
  }

  /**
   * Starts a press-to-drag on a card. Native HTML5 drag is deliberately avoided here: its drag
   * image is browser-drawn and lags the pointer at the OS cursor rate, so the card cannot be made
   * to track the mouse. Moving the element itself is also what lets the siblings be measured and
   * rearranged live, since the DOM order is then always the arrangement on screen.
   */
  function beginPlannedDrag(event: ReactPointerEvent<HTMLElement>, plannedId: string) {
    // The whole card is the handle, so a press that lands on a control inside it has to stay a
    // click — otherwise a text selection in an input would start a drag.
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("input,button,summary,details")) return;
    // A press would normally start a text selection, which fights the drag for the pointer.
    event.preventDefault();
    setDrag({ id: plannedId, slot: -1 });
  }

  const draggingPlannedId = drag?.id ?? "";

  // The listeners sit on the document rather than the card because once the pointer starts moving
  // it leaves the card almost immediately, and a re-render must not interrupt the capture.
  useEffect(() => {
    if (draggingPlannedId === "") return;
    const cards = plannedCards();
    const sourceIndex = cards.findIndex((card) => card.dataset.plannedId === draggingPlannedId);
    if (sourceIndex === -1) return;
    const source = cards[sourceIndex];

    const rects = cards.map((card) => card.getBoundingClientRect());
    const origin = rects[sourceIndex];
    const grabX = pointerAt.current.x - origin.left;
    const grabY = pointerAt.current.y - origin.top;
    // The card is positioned against its nearest *positioned* ancestor, which is not the grid it
    // sits in, so `offsetLeft` cannot be used to convert viewport coordinates into a transform.
    // Instead track the box the card is resting in, in viewport space, and let the delta from it be
    // the transform. It is reassigned whenever the card trades cells, because the DOM order is
    // rearranged as it goes and the box it belongs to goes with it.
    let restLeft = origin.left;
    let restTop = origin.top;
    const lattice = readLattice(rects);
    // Resting cards are only ever moved by `transform`, so the boxes captured here keep describing
    // the lattice for the whole gesture: the snap and the swap both measure against these rather
    // than against the live DOM, where a card in flight would report where the pointer put it.
    const origins = readOrigins(rects, lattice);
    // Applied once so that the moves below, which read layout, are not measured against a stale
    // midpoint. From here the card is driven purely by `transform`, which never reflows the list.
    source.style.width = `${origin.width}px`;
    source.style.height = `${origin.height}px`;
    document.body.classList.add("is-dragging-card");
    // Painted immediately rather than on the next frame: the boxes just measured are the ones the
    // whole gesture resolves against, and a frame's delay invites the effect to be torn down by the
    // re-render the press causes, taking the pending paint with it.
    paintGrid();

    /** The box a lattice cell stands for, in viewport coordinates. */
    const slotBox = (column: number, row: number) => {
      const left = lattice.columns[column];
      const top = lattice.rows[row];
      if (left === undefined || top === undefined) return null;
      return { left, top };
    };

    /**
     * Slides a resting card out of the cell it is losing, into the one being traded to it.
     *
     * Its DOM position is not touched: a card that has been pushed aside is still in the same place
     * in the list — it has only been given the carried card's cell to sit in — so a transform is all
     * that is needed, and the list never reflows mid-gesture.
     *
     * The slide is a transform that is immediately retracted: the offset puts the card back over
     * its old cell for one frame, and clearing it lets the transition carry the card across.
     */
    const slideInto = (card: HTMLElement, column: number, row: number) => {
      const to = slotBox(column, row);
      if (to === null) return;
      const at = card.getBoundingClientRect();
      const dx = Math.round(at.left - to.left);
      const dy = Math.round(at.top - to.top);
      if (dx === 0 && dy === 0) return;
      card.style.transition = "none";
      card.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      // The offset only exists to be animated away, so it is cleared on the next frame; the browser
      // has by then painted the card over its old cell and will tween from there.
      requestAnimationFrame(() => {
        card.style.transition = "transform 160ms var(--ease)";
        card.style.transform = "";
      });
    };

    /**
     * Puts the carried card where the pointer is asking for it, given where it is currently resting.
     *
     * Factored out because it has to be said twice: once as the pointer moves, and again the instant
     * the card trades cells — the trade changes which box the card rests in, and the transform the
     * card is already wearing was measured against the box it just left. Saying it a second time
     * settles the card onto the new cell in the same frame, instead of leaving it a cell's worth of
     * pixels off until the pointer happens to move again.
     */
    const placeCarried = (card: HTMLElement, wanted: { left: number; top: number }) => {
      card.style.transition = "none";
      card.style.transform = `translate3d(${Math.round(wanted.left - restLeft)}px,${Math.round(wanted.top - restTop)}px,0)`;
    };

    const move = (moveEvent: PointerEvent) => {
      pointerAt.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      const card = plannedCards().find((item) => item.dataset.plannedId === draggingPlannedId);
      if (card === undefined) return;
      // Suppress the transition for the duration of the move. The card's own entrance transition
      // would otherwise turn it into a slow-following shape trailing a dozen pixels behind the
      // cursor, and its `transitionend` would land mid-gesture and force a re-render.
      card.style.transition = "none";
      // The card rides the cursor, and the position it is riding to is rounded onto the lattice.
      // Snapping the destination rather than the transform is what keeps the card under the
      // pointer's grab point: the grid moves in whole cells, so the offset from the cursor to the
      // card is the same at every stop.
      const wanted = snapToGrid(moveEvent.clientX - grabX, moveEvent.clientY - grabY, lattice);
      placeCarried(card, wanted);
      card.style.zIndex = "40";
      card.dataset.dragging = "true";
      // Let the hit-test fall through to the cards underneath, so the pointer can always be
      // matched against a real resting card instead of the one being carried.
      card.style.pointerEvents = "none";

      // Which cell of the lattice the card is floating over: the cell it came from, plus however
      // many whole cells it has been carried. Naming it this way means the swap can be resolved
      // without a second measurement the carried card would only spoil.
      const own = origins[sourceIndex];
      const moveX = own === null || lattice.columnStep === null ? 0 : Math.round((wanted.left - own.left) / lattice.columnStep);
      const moveY = own === null || lattice.rowStep === null ? 0 : Math.round((wanted.top - own.top) / lattice.rowStep);
      if (own !== null) {
        const over = { column: own.column + moveX, row: own.row + moveY };
        // The cell the carried card is over belongs to whichever card stands there, so the two
        // trade places: the neighbour takes the carried card's cell and the carried card takes the
        // neighbour's. Only acting when the cell changes, and not on every pixel, keeps this to one
        // swap per cell crossed.
        const target = coveredOrigin(origins, sourceIndex, over.column, over.row);
        if (target === null) return;
        // The list is reordered to match, because the DOM order is what gets committed when the
        // gesture ends: the carried card steps into the neighbour's place and everything between
        // them shifts up. Only the two cards that changed cells are animated; the ones that merely
        // shifted an index are left where they are, so the movement reads as a trade.
        const list = card.parentElement;
        if (list !== null) {
          const held = card;
          held.remove();
          list.insertBefore(held, cards[target.index]);
        }
        slideInto(cards[target.index], own.column, own.row);
        // The carried card has just been re-inserted elsewhere in the list, so the box it rests in
        // has changed. The transform it is wearing is expressed against the old box, so it is
        // rewritten against the new one in the same breath — otherwise the card would snap back to
        // the slot it visually left, and stay there until the pointer moved again.
        const landed = slotBox(over.column, over.row);
        if (landed !== null) {
          restLeft = landed.left;
          restTop = landed.top;
          placeCarried(card, wanted);
        }
        // The two cards have changed cells, so the origin table follows them or the next move
        // would measure against cells that no longer hold anyone.
        origins[sourceIndex] = target.origin;
        origins[target.index] = own;
        // The outlines are the cells, and the cells are the same ones — but the card animating out
        // of a cell is still sitting in it for the length of the slide, so the lattice is redrawn
        // only after that has run its course.
        window.setTimeout(paintGrid, 170);
      }
    };

    const up = () => finishPlannedDrag();
    const cancel = () => finishPlannedDrag();
    const keydown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") finishPlannedDrag();
    };

    // Tracks whether the gesture ended normally, so the teardown below knows whether the cleanup
    // has already run. A `let` rather than a ref because only this closure ever reads it.
    let settled = false;

    function finishPlannedDrag() {
      settled = true;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", keydown);
      document.body.classList.remove("is-dragging-card");
      clearGrid();
      for (const card of plannedCards()) {
        // The carried card is holding a transform that keeps it under the cursor. It has to go, or
        // the card would stay parked off to one side of the slot the list says it is in — and the
        // next gesture would measure its origin from there.
        card.style.transition = "";
        card.style.transform = "";
        card.style.zIndex = "";
        card.style.pointerEvents = "";
        delete card.dataset.dragging;
      }
      // The order the user left behind. The list was rearranged as the cards were carried, so the
      // DOM order is already the arrangement on screen — reading it directly avoids depending on
      // where the cards happen to have finished their slide.
      const ids = plannedCards()
        .map((card) => card.dataset.plannedId ?? "")
        .filter((id) => id !== "");
      const target = reorderTarget.current;
      setDrag(null);
      if (target === null) return;
      // A gesture that never displaced anything should not spend a request.
      if (ids.join("\u0000") === target.day.plannedExercises.map((planned) => planned.id).join("\u0000")) return;
      void onReorderPlannedExercises(target.plan, target.day, ids);
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", keydown);

    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", keydown);
      document.body.classList.remove("is-dragging-card");
      // Tearing down mid-gesture (the Day changed under the pointer) leaves the same debris the
      // normal finish clears, so the same cleanup runs here rather than a partial copy of it.
      if (!settled) {
        clearGrid();
        for (const card of plannedCards()) {
          card.style.transition = "";
          card.style.transform = "";
          card.style.zIndex = "";
          card.style.pointerEvents = "";
          delete card.dataset.dragging;
        }
      }
    };
  }, [draggingPlannedId, onReorderPlannedExercises, paintGrid, clearGrid]);

  function confirmDeletion() {
    const pending = pendingDeletion;
    if (!pending) return;
    setPendingDeletion(null);
    void pending.run();
  }

  const plannedTarget = (planned: PlannedExercise) => {
    const weight = weightLabel(planned, weightUnit);
    return (
      <>
        <b>{planned.setCount}</b>
        <span>组</span>
        <span>·</span>
        <b>{planned.targetValue}</b> {planned.exercise.targetType === "REPETITIONS" ? "次" : "秒"}
        {weight === null ? null : (
          <>
            <span>·</span>
            <b>{weight}</b> {weightUnit}
          </>
        )}
      </>
    );
  };

  const matches = exercises.filter((exercise) => !search.trim() || exercise.name.includes(search.trim()));
  const plannedCount = (plan: Plan) => plan.workoutDays.reduce((total, day) => total + day.plannedExercises.length, 0);

  function planRow(plan: Plan) {
    const selected = plan.id === selectedPlan?.id;
    const expanded = openPlanId === plan.id;
    return (
      <li className="plan-row row" key={plan.id} data-testid="plan-row" data-selected={selected || undefined}>
        <div className="rail-head-mark" />
        <div>
          <button
            className="row-main"
            type="button"
            aria-current={selected ? "true" : "false"}
            aria-expanded={expanded ? "true" : "false"}
            onClick={() => selectPlan(plan.id)}
          >
            <span style={{ minWidth: 0 }}>
              <h4>{plan.name}</h4>
              <span className="meta">{plan.workoutDays.length} 个训练日 · {plannedCount(plan)} 个动作</span>
            </span>
            <span className="trail"><span className="chev">{expanded ? "⌄" : "›"}</span></span>
          </button>
          {expanded && (
            <ul className="daylist">
              {plan.workoutDays.map((day, dayIndex) => (
                <li className="day-row row" key={day.id} data-testid="day-index-item" data-selected={selected && day.id === selectedDay?.id ? "true" : undefined}>
                  <div>
                    {sortMode && (
                      <>
                        <button className="btn icon" type="button" disabled={dayIndex === 0} aria-label={`上移第 ${dayIndex + 1} 个训练日`} onClick={() => moveDay(dayIndex, -1)}>↑</button>
                        <button className="btn icon" type="button" disabled={dayIndex === plan.workoutDays.length - 1} aria-label={`下移第 ${dayIndex + 1} 个训练日`} onClick={() => moveDay(dayIndex, 1)}>↓</button>
                      </>
                    )}
                  </div>
                  <button
                    className="row-main"
                    type="button"
                    onClick={() => {
                      if (!selected) onSelectPlan(plan.id);
                      setExpandedPlanId(plan.id);
                      resetDayContext();
                      setIsRenamingPlan(false);
                      setDayByPlan((current) => ({ ...current, [plan.id]: day.id }));
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <h4>{day.name}</h4>
                      <span className="meta">{weekdayLabel(day.suggestedWeekday)} · {day.plannedExercises.length > 0 ? `${day.plannedExercises.length} 个动作` : "还没有动作"}</span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button className="add-inline" type="button" onClick={() => { if (!selected) onSelectPlan(plan.id); setExpandedPlanId(plan.id); resetDayContext(); setIsAddingDay(true); }}>
                  <i>＋</i>新建训练日
                </button>
              </li>
            </ul>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="workspace-section plan-view" aria-labelledby="plans-title">
      <div className="plan-view-head">
        <div>
          <p className="section-kicker">训练计划</p>
          <h1 id="plans-title">计划决定目标，训练只记录实际。</h1>
        </div>
        <p className="hint">训练开始时会锁定当前计划快照，之后修改计划不会改变历史。</p>
      </div>

      <div className="vA-grid" data-testid="plan-editor">
        <aside className="card panel" aria-label="计划与训练日">
          <div className="panel-head">
            <h2>计划</h2>
            <div className="segmented" role="group" aria-label="计划操作">
              <button type="button" aria-pressed={isCreatingPlan ? "true" : "false"} onClick={() => setIsCreatingPlan((open) => !open)}>新建计划</button>
              <button type="button" aria-pressed={sortMode ? "true" : "false"} onClick={() => setSortMode((open) => !open)}>调整顺序</button>
            </div>
          </div>

          {isCreatingPlan && (
            <form className="editor" onSubmit={submitPlan} data-testid="plan-form">
              <h4>新建计划</h4>
              <label className="field">
                <span>新计划名称</span>
                <input name="name" placeholder="例如：力量基础" required maxLength={80} autoFocus />
              </label>
              <div className="editor-foot">
                <button className="btn primary" type="submit" disabled={busy}>创建计划</button>
                <button className="btn quiet" type="button" onClick={() => setIsCreatingPlan(false)}>取消</button>
              </div>
            </form>
          )}

          {activePlans.length === 0 ? (
            <p className="empty">还没有训练计划。创建计划后，再添加训练日和动作。</p>
          ) : (
            <ul className="plans">{activePlans.map((plan) => planRow(plan))}</ul>
          )}

          {archivedPlans.length > 0 && (
            <div className="archived-tray">
              <button className="btn quiet sm" type="button" aria-expanded={archivedOpen ? "true" : "false"} onClick={() => setArchivedOpen((open) => !open)}>
                已归档（{archivedPlans.length}）{archivedOpen ? " ⌃" : " ⌄"}
              </button>
              {archivedOpen && (
                <ul className="plans">
                  {archivedPlans.map((plan) => (
                    <li className="row" key={plan.id} data-selected={plan.id === selectedPlan?.id ? "true" : undefined}>
                      <div />
                      <button className="row-main" type="button" onClick={() => { onSelectPlan(plan.id); setExpandedPlanId(""); resetDayContext(); }}>
                        <span style={{ minWidth: 0 }}>
                          <h4 style={{ color: "var(--muted)" }}>{plan.name}</h4>
                          <span className="meta">已归档 · {plan.workoutDays.length} 个训练日</span>
                        </span>
                        <span className="trail"><span className="tag">已归档</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {selectedPlan === null ? (
          <section className="card detail">
            <p className="empty"><strong>还没有训练计划</strong>先创建一个计划，再往里加训练日和动作。</p>
          </section>
        ) : (
          <section className="card detail">
            <div className="detail-head">
              <div>
                <p className="section-kicker">当前计划</p>
                {isRenamingPlan ? (
                  <form
                    className="title-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await onRenamePlan(selectedPlan, String(new FormData(event.currentTarget).get("name")));
                      setIsRenamingPlan(false);
                    }}
                  >
                    <input
                      className="title-input plan-title"
                      name="name"
                      defaultValue={selectedPlan.name}
                      required
                      maxLength={80}
                      aria-label="计划名称"
                      autoFocus
                    />
                    <button className="btn primary sm" type="submit" disabled={busy}>保存</button>
                    <button className="btn quiet sm" type="button" onClick={() => setIsRenamingPlan(false)}>取消</button>
                  </form>
                ) : (
                  <button
                    className="title-edit plan-name"
                    type="button"
                    aria-label="修改计划名称"
                    onClick={() => setIsRenamingPlan(true)}
                  >
                    {selectedPlan.name}
                  </button>
                )}
                <p className="sub">{selectedPlan.workoutDays.length} 个训练日 · {plannedCount(selectedPlan)} 个已安排动作</p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn quiet sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void onSetArchived(selectedPlan, selectedPlan.archivedAt === null)}
                >
                  {selectedPlan.archivedAt === null ? "归档计划" : "恢复计划"}
                </button>
              </div>
            </div>

            <div className="day-strip">
              {selectedPlan.workoutDays.map((day) => (
                <button
                  className="chip"
                  type="button"
                  key={day.id}
                  data-selected={day.id === selectedDay?.id ? "true" : undefined}
                  onClick={() => selectDay(day.id)}
                >
                  {day.name}<span>{weekdayLabel(day.suggestedWeekday)}</span>
                </button>
              ))}
              <button className="chip add" type="button" data-selected={isAddingDay ? "true" : undefined} onClick={() => { resetDayContext(); setIsAddingDay((open) => !open); }}>
                ＋ 训练日
              </button>
            </div>

            {isAddingDay && (
              <form className="editor" onSubmit={submitDay}>
                <h4>新建训练日</h4>
                <div className="field-row">
                  <label className="field" style={{ flex: "1 1 190px" }}>
                    <span>训练日名称</span>
                    <input name="name" placeholder="例如：推日" required maxLength={80} autoFocus />
                  </label>
                  <label className="field" style={{ flex: "0 1 150px" }}>
                    <span>建议星期</span>
                    <select name="weekday" defaultValue="">
                      <option value="">不指定</option>
                      {weekdays.map((label, index) => <option value={index} key={label}>{label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="editor-foot">
                  <button className="btn primary" type="submit" disabled={busy}>创建训练日</button>
                  <button className="btn quiet" type="button" onClick={() => setIsAddingDay(false)}>取消</button>
                </div>
              </form>
            )}

            {selectedDay === null ? (
              <p className="empty" style={{ marginTop: 22 }}>
                <strong>这个计划还没有训练日</strong>训练日用来把动作分组，例如「推日」「拉日」。
              </p>
            ) : (
              <>
                <details className="setup">
                  <summary>训练日设置 · {selectedDay.name}</summary>
                  <div className="setup-body">
                    <form
                      className="field-row"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const weekday = String(data.get("suggestedWeekday"));
                        await onUpdateDay(selectedPlan, selectedDay, String(data.get("name")), weekday === "" ? null : Number(weekday));
                      }}
                    >
                      <label className="field" style={{ flex: "1 1 190px" }}>
                        <span>训练日名称</span>
                        <input name="name" defaultValue={selectedDay.name} required maxLength={80} />
                      </label>
                      <label className="field" style={{ flex: "0 1 150px" }}>
                        <span>建议星期</span>
                        <select name="suggestedWeekday" defaultValue={selectedDay.suggestedWeekday ?? ""}>
                          <option value="">不指定</option>
                          {weekdays.map((label, index) => <option value={index} key={label}>{label}</option>)}
                        </select>
                      </label>
                      <button className="btn" type="submit" disabled={busy}>保存设置</button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingDeletion({
                          kind: "day",
                          title: `删除「${selectedDay.name}」？`,
                          impact: `这个训练日里的 ${selectedDay.plannedExercises.length} 个已安排动作会一起删除。`,
                          run: () => onDeleteDay(selectedPlan, selectedDay),
                        })}
                      >
                        删除训练日
                      </button>
                    </form>
                  </div>
                </details>

                <div className="day-actions-head">
                  <div>
                    <h3>{selectedDay.name} · 动作安排</h3>
                    <p>
                      {selectedDay.plannedExercises.length === 0
                        ? "还没有动作 · 先安排动作再训练"
                        : `共 ${selectedDay.plannedExercises.length} 个动作 · 预计 ${selectedDay.plannedExercises.length * 11 + 6} 分钟`}
                    </p>
                  </div>
                  <button
                    className="btn sm add-exercise"
                    type="button"
                    disabled={isAddingPlannedExercise}
                    onClick={() => { resetDayContext(); setIsAddingPlannedExercise(true); }}
                  >
                    ＋ 添加动作
                  </button>
                </div>

                {isAddingPlannedExercise && (
                  <div className="editor">
                    <h4>加动作到「{selectedDay.name}」</h4>
                    <label className="field">
                      <span>搜索动作库</span>
                      <input
                        name="search"
                        className="exercise-search"
                        value={search}
                        placeholder="输入名称筛选，例如：卧推"
                        onChange={(event) => setSearch(event.target.value)}
                        autoFocus
                      />
                    </label>
                    <div className="search-results">
                      {matches.length === 0 ? (
                        <button type="button" disabled>没有匹配的动作，先去「动作」页创建</button>
                      ) : matches.map((exercise) => (
                        <button
                          type="button"
                          key={exercise.id}
                          data-selected={pickedExerciseId === exercise.id ? "true" : undefined}
                          onClick={() => setPickedExerciseId(exercise.id)}
                        >
                          <span>{exercise.name}</span>
                          <small>
                            {exercise.resistanceType === "WEIGHTED" ? "负重" : "自重"} · {exercise.targetType === "REPETITIONS" ? "次数" : "时长"}
                          </small>
                        </button>
                      ))}
                    </div>
                    <form onSubmit={submitPlannedExercise}>
                      <input type="hidden" name="exerciseId" value={pickedExerciseId} />
                      <div className="composer-grid">
                        <label className="field">
                          <span>组数</span>
                          <input name="setCount" type="number" min={1} defaultValue={3} required />
                        </label>
                        <label className="field">
                          <span>目标（次 / 秒）</span>
                          <input name="targetValue" type="number" min={1} defaultValue={10} required />
                        </label>
                        <label className="field">
                          <span>重量 {weightUnit}（自重留空）</span>
                          <input name="weight" type="number" min={0} step={0.1} />
                        </label>
                      </div>
                      <div className="editor-foot">
                        <button className="btn primary" type="submit" disabled={busy || pickedExerciseId === ""}>加进这个训练日</button>
                        <button className="btn quiet" type="button" onClick={() => { setPickedExerciseId(""); setSearch(""); setIsAddingPlannedExercise(false); }}>取消</button>
                      </div>
                    </form>
                  </div>
                )}

                {selectedDay.plannedExercises.length === 0 ? (
                  <div className="ex-list">
                    <p className="empty left" style={{ marginTop: 20 }}>
                      <strong>「{selectedDay.name}」还没有动作</strong>
                      先从动作库挑几个动作，再定组数、目标和重量。安排完成后就能开始训练。
                    </p>
                  </div>
                ) : (
                  <div className="ex-list" ref={listRef} data-dragging-grid={drag === null ? undefined : "true"}>
                    {selectedDay.plannedExercises.map((planned, index) => {
                      const record = progressFor(planned);
                      const latest = record?.recent.at(-1);
                      const openRecap = openRecapId === planned.id;
                      return (
                        <article
                          className="exercise"
                          data-testid="planned-row"
                          key={planned.id}
                          data-planned-id={planned.id}
                          data-dragging={draggingPlannedId === planned.id ? "true" : undefined}
                          onPointerDown={(event) => {
                            pointerAt.current = { x: event.clientX, y: event.clientY };
                            beginPlannedDrag(event, planned.id);
                          }}
                        >
                          <h4>{planned.exercise.name}</h4>
                          <p className="nums">{plannedTarget(planned)}</p>
                          <div className="ex-actions">
                            {sortMode && (
                              <>
                                <button className="btn icon" type="button" disabled={index === 0} aria-label={`上移 ${planned.exercise.name}`} onClick={() => movePlannedExercise(index, -1)}>↑</button>
                                <button className="btn icon" type="button" disabled={index === selectedDay.plannedExercises.length - 1} aria-label={`下移 ${planned.exercise.name}`} onClick={() => movePlannedExercise(index, 1)}>↓</button>
                              </>
                            )}
                          </div>
                          <div className="card-actions">
                            <details className="inline-edit" open={editingPlannedId === planned.id || undefined}>
                              <summary
                                aria-label={`编辑 ${planned.exercise.name} 的目标`}
                                onClick={(event) => {
                                  // `open` is driven by state, so cancel the native flip to keep the
                                  // two from fighting (the attribute would win, but only after a flicker).
                                  event.preventDefault();
                                  setEditingPlannedId(editingPlannedId === planned.id ? "" : planned.id);
                                }}
                              >
                                ✎
                              </summary>
                              <div className="pop">
                                <p className="pop-title">编辑目标</p>
                                <form
                                  onSubmit={async (event) => {
                                    event.preventDefault();
                                    const data = new FormData(event.currentTarget);
                                    const rawWeight = String(data.get("weight"));
                                    await onUpdatePlannedExercise(selectedPlan, selectedDay, planned, {
                                      setCount: Number(data.get("setCount")),
                                      targetValue: Number(data.get("targetValue")),
                                      weight: rawWeight === "" ? undefined : Number(rawWeight),
                                      weightUnit: rawWeight === "" ? undefined : weightUnit,
                                    });
                                    setEditingPlannedId("");
                                  }}
                                >
                                  <div className="field">
                                    <span>组数</span>
                                    <input name="setCount" type="number" min={1} defaultValue={planned.setCount} required />
                                  </div>
                                  <div className="field">
                                    <span>次数 / 秒数</span>
                                    <input name="targetValue" type="number" min={1} defaultValue={planned.targetValue} required />
                                  </div>
                                  <div className="field">
                                    <span>重量 {weightUnit}（自重留空）</span>
                                    <input
                                      name="weight"
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      defaultValue={weightLabel(planned, weightUnit) ?? ""}
                                    />
                                  </div>
                                  <div className="pop-actions">
                                    <button className="btn primary sm" type="submit" disabled={busy}>保存目标</button>
                                    <button className="btn quiet sm" type="button" onClick={() => setEditingPlannedId("")}>取消</button>
                                  </div>
                                </form>
                              </div>
                            </details>
                            <button
                              className="btn quiet sm remove-planned"
                              type="button"
                              disabled={busy}
                              onClick={() => setPendingDeletion({
                                kind: "planned",
                                title: `把「${planned.exercise.name}」移出这个训练日？`,
                                impact: "已经记录的训练历史不受影响，之后这个动作不会再出现在这个训练日里。",
                                run: () => onDeletePlannedExercise(selectedPlan, selectedDay, planned),
                              })}
                            >
                              移除
                            </button>
                          </div>
                          <details className="recap" open={openRecap || undefined}>
                            <summary
                              onClick={(event) => {
                                event.preventDefault();
                                setOpenRecapId(openRecap ? "" : planned.id);
                              }}
                            >
                              {record === undefined || latest === undefined ? (
                                <span className="faint">还没有完成记录</span>
                              ) : (
                                <>
                                  最近 {latest.achievementRate}%
                                  <span className="meter" style={{ marginLeft: 8 }}>{meterBars(record.recent)}</span>
                                </>
                              )}
                            </summary>
                            <div className="recap-body">
                              <ul>
                                {record === undefined || record.recent.length === 0 ? (
                                  <li><span>这个动作还没有完成的训练记录。</span></li>
                                ) : [...record.recent].reverse().map((entry, index) => (
                                  <li key={`${entry.date}-${index}`}>
                                    <span>{entry.date.slice(5)}</span>
                                    <span>达成 {entry.achievementRate}%{entry.achievementRate >= 100 ? " · 达标" : ""}</span>
                                  </li>
                                ))}
                              </ul>
                              {record?.suggestion ? <p className="tip">进阶建议：{record.suggestion}</p> : null}
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="day-cta">
                  {selectedPlan.archivedAt !== null ? (
                    <p className="locked">计划已归档，恢复后才能开始训练。</p>
                  ) : selectedDay.plannedExercises.length === 0 ? (
                    <p className="locked">先给这个训练日添加动作，然后就能开始训练。</p>
                  ) : (
                    <button className="btn primary start-workout" type="button" disabled={busy} onClick={() => void onStartWorkout(selectedDay)}>
                      开始「{selectedDay.name}」
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {pendingDeletion && (
        <section className="layer" role="presentation" onClick={confirmDeletion}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="section-kicker">不可撤销的操作</p>
            <h2 id="plan-dialog-title">{pendingDeletion.title}</h2>
            <p>{pendingDeletion.kind === "day" ? "训练日删除后无法恢复。" : "移出后可以重新添加。"}</p>
            <div className="impact">{pendingDeletion.impact}</div>
            <div className="dialog-actions">
              <button className="btn quiet" type="button" onClick={() => setPendingDeletion(null)}>取消</button>
              <button className="btn danger" type="button" autoFocus onClick={confirmDeletion}>确认删除</button>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
