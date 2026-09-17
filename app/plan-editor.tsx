"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FormEvent,
  useCallback,
  useRef,
  useState,
  type ReactNode,
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

/** The cards currently on screen, in DOM order — which is always the arrangement being shown. */
function plannedCards() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="planned-row"]'));
}

/**
 * The Day pills in the strip, in DOM order.
 *
 * The ＋ chip is deliberately not one of them: it is not a slot, so it gets no outline and no place
 * in the order the lattice draws.
 */
function dayChips() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="day-chip"]'));
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

/**
 * How far the pointer has to travel before a press becomes a drag.
 *
 * The whole card is the handle — that is what makes it feel picked up rather than grabbed by a
 * corner — so a press has to stay a click by default, or the ✎ summary and the 移除 button would
 * each open their popover and start a carry on the same gesture. Eight pixels is comfortably under
 * anything a user aims at on a card this size, and comfortably over the wobble of a click.
 */
const DRAG_ACTIVATION_DISTANCE = 8;

function gridLayers(boxes: { left: number; top: number; width: number; height: number }[]) {
  return {
    image: boxes.map(() => `linear-gradient(${GRID_STROKE},${GRID_STROKE})`).join(","),
    position: boxes.map((box) => `${Math.round(box.left + GRID_INSET)}px ${Math.round(box.top + GRID_INSET)}px`).join(","),
    size: boxes.map((box) => `${Math.round(box.width - GRID_INSET * 2)}px ${Math.round(box.height - GRID_INSET * 2)}px`).join(","),
    repeat: boxes.map(() => "no-repeat").join(","),
  };
}

/**
 * Paints one outline per box onto `host`, in `host`'s own coordinates.
 *
 * A box under a resting item is hidden by it, which is exactly the point: what the lattice is there
 * to reveal is the slot the item would move into. An empty list paints nothing — there is no slot
 * to speak of until there is something to put in one. `shown` is what lets a wipe be a no-op when
 * there is nothing to wipe.
 */
function paintLattice(host: HTMLElement, boxes: DOMRect[], shown: { current: boolean }) {
  if (boxes.length === 0 || boxes.some((box) => box.width <= 0)) return;
  const hostBox = host.getBoundingClientRect();
  const layers = gridLayers(
    boxes.map((box) => ({ left: box.left - hostBox.left, top: box.top - hostBox.top, width: box.width, height: box.height })),
  );
  host.style.backgroundImage = layers.image;
  host.style.backgroundPosition = layers.position;
  host.style.backgroundSize = layers.size;
  host.style.backgroundRepeat = layers.repeat;
  shown.current = true;
}

function wipeLattice(host: HTMLElement, shown: { current: boolean }) {
  if (!shown.current) return;
  host.style.backgroundImage = "";
  host.style.backgroundPosition = "";
  host.style.backgroundSize = "";
  host.style.backgroundRepeat = "";
  shown.current = false;
}

/**
 * One planned exercise, as a card that can be picked up and set down elsewhere in the list.
 *
 * This is a component of its own because `useSortable` is a hook, and a hook cannot be called from
 * inside the `map` that renders the grid. It is deliberately as thin as it can be: it attaches the
 * ref, the listeners and the transform, and passes the card's contents straight through, so what a
 * card *looks like* is still decided in exactly one place — the JSX below.
 *
 * The listeners go on the whole card rather than on a handle, which is what makes it feel picked up
 * rather than grabbed by a corner. A press that lands on the ✎ summary or the 移除 button still
 * behaves, because the sensor does not arm until the pointer has moved `DRAG_ACTIVATION_DISTANCE`.
 *
 * `transition` is dnd-kit's: it is a transform transition while a card is making room for another,
 * and `null` while a card is the one being carried, so the carried card tracks the pointer with no
 * tween in the way.
 *
 * The carried card is marked opaque rather than the whole list being marked, because opacity on an
 * ancestor groups its subtree into one compositing layer and would flatten the blur on every card.
 * The stylesheet reads the mark from the list, so the list is opaque exactly while it holds one.
 *
 * The role is stated after the attributes so that it wins: dnd-kit announces a sortable as
 * `role="button"`, which would wrap a button — and a summary, and three inputs — in another button.
 * Screen readers cannot make sense of that nesting, and anything looking up a card's action by role
 * finds the card too. Keyboard operation does not come from the role: it comes from the listeners,
 * and the name comes from `aria-roledescription`.
 */
function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <article
      ref={setNodeRef}
      className="exercise"
      data-testid="planned-row"
      data-planned-id={id}
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      role="group"
      {...listeners}
    >
      {children}
    </article>
  );
}

/**
 * One Workout Day in the plan accordion, as a row that can be picked up and set down elsewhere in
 * the list.
 *
 * Same shape and same reasons as `SortableCard` above — a component rather than a call inside
 * `map` because `useSortable` is a hook, listeners on the whole row so it is picked up rather than
 * grabbed by a handle, and the role restated after the attributes so dnd-kit's `role="button"`
 * does not wrap the row's own button.
 *
 * The row is its own sortable list rather than a second entry in the exercise grid's: the two live
 * in different columns of the page and never carry at the same time, so one `DndContext` each keeps
 * the collision detection to the list actually being sorted.
 */
function SortableDayRow({ id, selected, children }: { id: string; selected: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className="day-row row"
      data-testid="day-index-item"
      data-day-id={id}
      data-selected={selected ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      role="group"
      {...listeners}
    >
      {children}
    </li>
  );
}

/**
 * One Workout Day in the strip, as a pill that can be picked up and set down elsewhere in the row.
 *
 * The same shape and the same reasons as `SortableDayRow`, with one difference: the pill holds two
 * buttons — the name, and the weekday badge that turns into a bin — so the listeners sit on the
 * pill rather than on a button that would have to carry them. The distance threshold keeps both
 * buttons clickable; the role is restated after the attributes so dnd-kit's `role="button"` does
 * not wrap a button in another one.
 */
function SortableDayChip({ id, selected, children }: { id: string; selected: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span
      ref={setNodeRef}
      className="chip"
      data-testid="day-chip"
      data-day-id={id}
      data-selected={selected ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      role="group"
      {...listeners}
    >
      {children}
    </span>
  );
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
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isAddingDay, setIsAddingDay] = useState(false);
  const [isAddingPlannedExercise, setIsAddingPlannedExercise] = useState(false);
  const [isRenamingPlan, setIsRenamingPlan] = useState(false);
  const [editingPlannedId, setEditingPlannedId] = useState("");
  const [openRecapId, setOpenRecapId] = useState("");
  const [search, setSearch] = useState("");
  const [pickedExerciseId, setPickedExerciseId] = useState("");
  // Which card is in the air, for as long as the gesture lasts. The drag itself belongs to dnd-kit;
  // this is only what the list needs in order to paint its lattice, and what the cards need in order
  // to know that one of them is being carried.
  const [draggingId, setDraggingId] = useState("");
  // The Day strip carries pills instead of cards, and its lattice is a different picture of a
  // different list, so it keeps its own flag and its own element.
  const [draggingDayId, setDraggingDayId] = useState("");
  // The lattice is drawn onto the element rather than through the JSX because it is a picture of
  // where the cards actually are, and that is only knowable once layout has run.
  const listRef = useRef<HTMLDivElement | null>(null);
  const gridShown = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const chipGridShown = useRef(false);
  // A press only becomes a drag once the pointer has travelled far enough. The whole card is the
  // handle — that is what makes it feel picked up rather than grabbed by a corner — so without this
  // every press on the ✎ summary or the 移除 button would start a carry instead of a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

  const activePlans = plans.filter((plan) => plan.archivedAt === null);
  const archivedPlans = plans.filter((plan) => plan.archivedAt !== null);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null;
  const selectedDay = selectedPlan?.workoutDays.find((day) => day.id === dayByPlan[selectedPlan.id])
    ?? selectedPlan?.workoutDays[0]
    ?? null;
  const progressFor = (planned: PlannedExercise) => progress.find((item) => item.plannedExerciseId === planned.id);
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
    paintLattice(list, plannedCards().map((card) => card.getBoundingClientRect()), gridShown);
  }, []);

  const clearGrid = useCallback(() => {
    const list = listRef.current;
    if (list === null) return;
    wipeLattice(list, gridShown);
  }, []);

  // The Day strip paints the same lattice around its own pills, onto its own element: two lists in
  // two columns of the page, never carried at the same time.
  const paintChipGrid = useCallback(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    paintLattice(strip, dayChips().map((chip) => chip.getBoundingClientRect()), chipGridShown);
  }, []);

  const clearChipGrid = useCallback(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    wipeLattice(strip, chipGridShown);
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
    setDraggingId("");
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

  /**
   * A Workout Day was let go over the list.
   *
   * Same contract as `dropPlannedExercise` below: dnd-kit reports the row that was lifted and the
   * row it came to rest on, and `arrayMove` turns those two ids into the new order. The Day rows
   * are one column rather than a grid, so the distance that decides a swap is vertical — the
   * strategy on the list says so, not this handler.
   */
  function dropDay(plan: Plan, event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const ids = plan.workoutDays.map((day) => day.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    void onReorderDays(plan, arrayMove(ids, from, to));
  }

  /**
   * A card has been picked up: the gesture is live, and the lattice comes out.
   *
   * The lattice is painted here, before anything has moved, because it is a picture of the resting
   * layout — once dnd-kit starts translating cards, the boxes it would measure are the ones already
   * in flight.
   */
  function beginPlannedDrag(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
    document.body.classList.add("is-dragging-card");
    paintGrid();
  }

  /**
   * The gesture is over, whether it ended in a drop or in a cancellation. Every trace a drag leaves
   * — the raised cursor, the lattice, the card held in the air — belongs to the gesture rather than
   * to its outcome, so both endings clear the same things.
   */
  function releasePlannedDrag() {
    setDraggingId("");
    document.body.classList.remove("is-dragging-card");
    clearGrid();
  }

  /**
   * A Day pill has been picked up: the strip's own lattice, for the same reason and on the same
   * terms as the cards'.
   */
  function beginDayStripDrag(event: DragStartEvent) {
    setDraggingDayId(String(event.active.id));
    document.body.classList.add("is-dragging-card");
    paintChipGrid();
  }

  /** The gesture is over, drop or cancel — and every trace of it belongs to the gesture. */
  function releaseDayStripDrag() {
    setDraggingDayId("");
    document.body.classList.remove("is-dragging-card");
    clearChipGrid();
  }

  /**
   * A Day pill was let go over the strip.
   *
   * The order being rearranged is the same one the accordion rearranges — the pills and the rows
   * are two views of `plan.workoutDays` — so `dropDay` owns the arithmetic for both. Only the
   * direction differs, and that is the list's strategy to state, not this handler's.
   */
  function dropDayPill(event: DragEndEvent) {
    releaseDayStripDrag();
    if (selectedPlan === null) return;
    dropDay(selectedPlan, event);
  }

  /**
   * A card was let go over the grid.
   *
   * dnd-kit reports which card was lifted and which one it came to rest on, and leaves the DOM
   * alone — it only animates the cards toward where they are going. So the new order is derived
   * from those two ids rather than read back out of the DOM, and the array the cards are rendered
   * from is the thing that moves. `arrayMove` is the library's own, so the two cannot disagree
   * about what "moving A onto B" means — the reading that has to be right is the same one the
   * animation was already drawn from.
   */
  function dropPlannedExercise(event: DragEndEvent) {
    releasePlannedDrag();
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    if (selectedPlan === null || selectedDay === null) return;
    const ids = selectedDay.plannedExercises.map((planned) => planned.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    void onReorderPlannedExercises(selectedPlan, selectedDay, arrayMove(ids, from, to));
  }

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => dropDay(plan, event)}
          >
            <SortableContext items={plan.workoutDays.map((day) => day.id)} strategy={verticalListSortingStrategy}>
              <ul className="daylist">
                {plan.workoutDays.map((day) => (
                  <SortableDayRow key={day.id} id={day.id} selected={selected && day.id === selectedDay?.id}>
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
                  </SortableDayRow>
                ))}
                <li>
                  <button className="add-inline" type="button" onClick={() => { if (!selected) onSelectPlan(plan.id); setExpandedPlanId(plan.id); resetDayContext(); setIsAddingDay(true); }}>
                    <i>＋</i>新建训练日
                  </button>
                </li>
              </ul>
            </SortableContext>
          </DndContext>
        )}
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
            <button
              className="panel-add"
              type="button"
              aria-label="新建计划"
              aria-pressed={isCreatingPlan ? "true" : "false"}
              onClick={() => setIsCreatingPlan((open) => !open)}
            >
              <span aria-hidden="true">＋</span>
            </button>
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={beginDayStripDrag}
              onDragEnd={dropDayPill}
              onDragCancel={releaseDayStripDrag}
            >
              <SortableContext
                items={selectedPlan.workoutDays.map((day) => day.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="day-strip" ref={stripRef} data-dragging-grid={draggingDayId === "" ? undefined : "true"}>
                  {selectedPlan.workoutDays.map((day) => (
                    <SortableDayChip key={day.id} id={day.id} selected={day.id === selectedDay?.id}>
                      <button className="chip-name" type="button" onClick={() => selectDay(day.id)}>
                        {day.name}
                      </button>
                      {/* The weekday badge doubles as the delete affordance: hover swaps it for a bin. */}
                      <button
                        className="chip-drop"
                        type="button"
                        disabled={busy}
                        aria-label={`删除训练日「${day.name}」`}
                        title={`删除训练日「${day.name}」`}
                        onClick={() => setPendingDeletion({
                          kind: "day",
                          title: `删除「${day.name}」？`,
                          impact: `这个训练日里的 ${day.plannedExercises.length} 个已安排动作会一起删除。`,
                          run: () => onDeleteDay(selectedPlan, day),
                        })}
                      >
                        <span className="chip-when">{weekdayLabel(day.suggestedWeekday)}</span>
                        <svg className="chip-trash" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path
                            d="M4 4l8 8M12 4l-8 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </SortableDayChip>
                  ))}
                  <button className="chip add" type="button" data-selected={isAddingDay ? "true" : undefined} onClick={() => { resetDayContext(); setIsAddingDay((open) => !open); }}>
                    ＋ 训练日
                  </button>
                </div>
              </SortableContext>
            </DndContext>

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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={beginPlannedDrag}
                    onDragEnd={dropPlannedExercise}
                    onDragCancel={releasePlannedDrag}
                  >
                    <SortableContext
                      items={selectedDay.plannedExercises.map((planned) => planned.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="ex-list" ref={listRef} data-dragging-grid={draggingId === "" ? undefined : "true"}>
                        {selectedDay.plannedExercises.map((planned) => {
                          const record = progressFor(planned);
                          const latest = record?.recent.at(-1);
                          const openRecap = openRecapId === planned.id;
                          return (
                            <SortableCard key={planned.id} id={planned.id}>
                              <h4>{planned.exercise.name}</h4>
                              <p className="nums">{plannedTarget(planned)}</p>
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
                            </SortableCard>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
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
