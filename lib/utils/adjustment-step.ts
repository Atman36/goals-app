import {
  ADJUSTMENT_NO_IF_THEN,
  ADJUSTMENT_NO_OPEN_STEPS,
} from "@/lib/plan-adjustment-labels";
import type { SavePlanAdjustmentResult } from "@/lib/actions/plan-adjustments";

// T13 (PLAN §5 B4). Pure logic behind the plan-adjustment step: which open
// steps a person can pick from, which decisions are available for them, and
// what to say after a save. No DB, no React — Decisions D8 requires this to
// be testable without a component-testing library.

export type AdjustmentStepOption = { id: string; title: string; hasIfThen: boolean };

/** Open (not-done) checklist items as the step-picker's options, in their
 *  original order. `hasIfThen` mirrors whether the item's ifThen plan is set. */
export function toAdjustmentStepOptions(
  items: { id: string; title: string; isDone: boolean; ifThen: unknown }[],
): AdjustmentStepOption[] {
  return items
    .filter((item) => item.isDone === false)
    .map((item) => ({
      id: item.id,
      title: item.title,
      hasIfThen: item.ifThen !== null && item.ifThen !== undefined,
    }));
}

/** Which of the four step-editing decisions are pickable, given the open
 *  steps on offer (Decisions D5): `smaller` needs at least one open step,
 *  `change_trigger` needs at least one with an existing if-then plan. `keep`
 *  and `add_coping_plan` never depend on the list. */
export function decisionAvailability(options: AdjustmentStepOption[]): {
  smaller: { enabled: boolean; reason: string | null };
  change_trigger: { enabled: boolean; reason: string | null };
  keep: { enabled: true; reason: null };
  add_coping_plan: { enabled: true; reason: null };
} {
  const hasOpenSteps = options.length > 0;
  const hasIfThenStep = options.some((option) => option.hasIfThen);
  return {
    smaller: hasOpenSteps ? { enabled: true, reason: null } : { enabled: false, reason: ADJUSTMENT_NO_OPEN_STEPS },
    change_trigger: hasIfThenStep
      ? { enabled: true, reason: null }
      : { enabled: false, reason: ADJUSTMENT_NO_IF_THEN },
    keep: { enabled: true, reason: null },
    add_coping_plan: { enabled: true, reason: null },
  };
}

/** What to tell the person after savePlanAdjustment resolves — the ONE source
 *  of this copy, verbatim per the spec. */
export function adjustmentResultMessage(result: SavePlanAdjustmentResult): string {
  if (result.ok) {
    if (result.duplicate) return "Сегодня уже отмечали — ничего не меняю.";
    if (result.changedStep) return "Готово. Шаг на завтра поправлен.";
    return "Записал.";
  }
  switch (result.reason) {
    case "stale_token":
      return "День уже сменился — обновите страницу.";
    case "not_found":
      return "Цель недоступна.";
    case "item_not_found":
      return "Шаг не найден — возможно, он изменился.";
    case "no_if_then":
      return "У этого шага нет «если—то».";
    case "invalid":
      return "Проверьте заполненные поля.";
  }
}
