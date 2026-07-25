import { describe, expect, it } from "vitest";

import {
  adjustmentResultMessage,
  decisionAvailability,
  toAdjustmentStepOptions,
  type AdjustmentStepOption,
} from "@/lib/utils/adjustment-step";
import { ADJUSTMENT_NO_IF_THEN, ADJUSTMENT_NO_OPEN_STEPS } from "@/lib/plan-adjustment-labels";
import type { SavePlanAdjustmentResult } from "@/lib/actions/plan-adjustments";

// T13 (PLAN §5 B4). Pure logic only — no DB, no render — per Decisions D8:
// the availability rules and result copy must be testable without a
// component-testing library (there isn't one in this project).

describe("toAdjustmentStepOptions", () => {
  it("drops done items and keeps the original order", () => {
    const options = toAdjustmentStepOptions([
      { id: "a", title: "First", isDone: false, ifThen: null },
      { id: "b", title: "Second (done)", isDone: true, ifThen: null },
      { id: "c", title: "Third", isDone: false, ifThen: null },
    ]);
    expect(options.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("marks hasIfThen true for a non-empty ifThen and false for null", () => {
    const options = toAdjustmentStepOptions([
      {
        id: "a",
        title: "Has plan",
        isDone: false,
        ifThen: { trigger: "утро", action: "написать", planType: "initiation" },
      },
      { id: "b", title: "No plan", isDone: false, ifThen: null },
    ]);
    expect(options).toEqual<AdjustmentStepOption[]>([
      { id: "a", title: "Has plan", hasIfThen: true },
      { id: "b", title: "No plan", hasIfThen: false },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(toAdjustmentStepOptions([])).toEqual([]);
  });
});

describe("decisionAvailability", () => {
  it("disables smaller and change_trigger for an empty list", () => {
    const result = decisionAvailability([]);
    expect(result.smaller).toEqual({ enabled: false, reason: ADJUSTMENT_NO_OPEN_STEPS });
    expect(result.change_trigger).toEqual({ enabled: false, reason: ADJUSTMENT_NO_IF_THEN });
    expect(result.keep).toEqual({ enabled: true, reason: null });
    expect(result.add_coping_plan).toEqual({ enabled: true, reason: null });
  });

  it("enables smaller but disables change_trigger for a list with no ifThen", () => {
    const options: AdjustmentStepOption[] = [{ id: "a", title: "Step", hasIfThen: false }];
    const result = decisionAvailability(options);
    expect(result.smaller).toEqual({ enabled: true, reason: null });
    expect(result.change_trigger).toEqual({ enabled: false, reason: ADJUSTMENT_NO_IF_THEN });
    expect(result.keep).toEqual({ enabled: true, reason: null });
    expect(result.add_coping_plan).toEqual({ enabled: true, reason: null });
  });

  it("enables both when at least one option has an ifThen", () => {
    const options: AdjustmentStepOption[] = [{ id: "a", title: "Step", hasIfThen: true }];
    const result = decisionAvailability(options);
    expect(result.smaller).toEqual({ enabled: true, reason: null });
    expect(result.change_trigger).toEqual({ enabled: true, reason: null });
    expect(result.keep).toEqual({ enabled: true, reason: null });
    expect(result.add_coping_plan).toEqual({ enabled: true, reason: null });
  });
});

describe("adjustmentResultMessage", () => {
  const cases: [SavePlanAdjustmentResult, string][] = [
    [{ ok: true, duplicate: true, changedStep: false }, "Сегодня уже отмечали — ничего не меняю."],
    [{ ok: true, duplicate: false, changedStep: true }, "Готово. Шаг на завтра поправлен."],
    [{ ok: true, duplicate: false, changedStep: false }, "Записал."],
    [{ ok: false, reason: "stale_token" }, "День уже сменился — обновите страницу."],
    [{ ok: false, reason: "not_found" }, "Цель недоступна."],
    [{ ok: false, reason: "item_not_found" }, "Шаг не найден — возможно, он изменился."],
    [{ ok: false, reason: "no_if_then" }, "У этого шага нет «если—то»."],
    [{ ok: false, reason: "invalid" }, "Проверьте заполненные поля."],
  ];

  it.each(cases)("maps %o to %s", (result, expected) => {
    expect(adjustmentResultMessage(result)).toBe(expected);
  });
});
