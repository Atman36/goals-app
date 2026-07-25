import type {
  PlanAdjustmentBarrier,
  PlanAdjustmentDecision,
  PlanAdjustmentSource,
} from "@/lib/validators/plan-adjustment";

// Shared copy for the plan-adjustment step (T13, PLAN §5 B4) — the ONE source
// of the barrier/decision wording, same pattern as lib/checkin-labels.ts.
// Neutral module (no "use client") so both the client step component and any
// future server surface can import it without dragging a client boundary
// across. Tone constraint from the spec: no "why didn't you do it", no
// evaluative language — the question is about the obstacle and the next step,
// never about the person.

export const BARRIER_LABELS: Record<PlanAdjustmentBarrier, string> = {
  time: "Не хватило времени",
  energy: "Не было сил",
  emotion: "Настроение, состояние",
  unclear_step: "Шаг непонятен",
  wrong_context: "Не то место или обстановка",
  forgot: "Забыл",
  competing_goal: "Другая цель перетянула",
  external_event: "Вмешались обстоятельства",
  not_my_goal_anymore: "Это перестало быть моей целью",
};

export const DECISION_LABELS: Record<PlanAdjustmentDecision, string> = {
  keep: "Оставить шаг как есть",
  smaller: "Сделать шаг меньше",
  change_trigger: "Сменить время или место",
  add_coping_plan: "Добавить план на этот случай",
  pause_goal: "Поставить на паузу",
  drop_goal: "Закрыть цель",
};

// T16 FIX-8: the reflection screen already asks "Что помешало или помогло?"
// as its third question, so the node repeating "Что помешало?" right below it
// read as the same question twice. The daily surface keeps the short form.
export const ADJUSTMENT_BARRIER_HEADING: Record<PlanAdjustmentSource, string> = {
  checkin: "Что помешало?",
  reflection: "Что помешало прошлому обещанию?",
};
export const ADJUSTMENT_BARRIER_HINT =
  "Одно касание. Это нужно, чтобы поправить шаг, а не чтобы оценить день.";
export const ADJUSTMENT_DECISION_HEADING = "Что сделаем с шагом на завтра?";
export const ADJUSTMENT_EXIT_HEADING = "Или пересмотреть саму цель:";
export const ADJUSTMENT_EXIT_HANDOFF =
  "Записал. Статус цели меняется на её странице — там есть «Архивировать» и «Удалить».";
export const ADJUSTMENT_NO_OPEN_STEPS = "Пока нет открытых шагов, которые можно уменьшить.";
export const ADJUSTMENT_NO_IF_THEN = "Пока нет ни одного шага «если—то» — сменить триггер не у чего.";
