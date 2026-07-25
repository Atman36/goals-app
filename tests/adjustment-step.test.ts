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
  // T16 FIX-4: the two time-scoped branches differ by surface — the daily card
  // refuses a second answer for the same DAY, the weekly node for the same
  // WEEK — so each surface has to be asserted separately, not just one of them.
  const checkinCases: [SavePlanAdjustmentResult, string][] = [
    [{ ok: true, duplicate: true, changedStep: false }, "Сегодня уже отмечали — ничего не меняю."],
    [{ ok: true, duplicate: false, changedStep: true }, "Готово. Шаг на завтра поправлен."],
    [{ ok: true, duplicate: false, changedStep: false }, "Записал."],
    [{ ok: false, reason: "stale_token" }, "День уже сменился — обновите страницу."],
    [{ ok: false, reason: "not_found" }, "Цель недоступна."],
    [{ ok: false, reason: "item_not_found" }, "Шаг не найден — возможно, он изменился."],
    [{ ok: false, reason: "no_if_then" }, "У этого шага нет «если—то»."],
    [{ ok: false, reason: "invalid" }, "Проверьте заполненные поля."],
  ];

  const reflectionCases: [SavePlanAdjustmentResult, string][] = [
    [
      { ok: true, duplicate: true, changedStep: false },
      "На этой неделе уже отмечали — ничего не меняю.",
    ],
    [{ ok: true, duplicate: false, changedStep: true }, "Готово. Шаг на завтра поправлен."],
    [{ ok: true, duplicate: false, changedStep: false }, "Записал."],
    [{ ok: false, reason: "stale_token" }, "Неделя уже сменилась — обновите страницу."],
    [{ ok: false, reason: "not_found" }, "Цель недоступна."],
    [{ ok: false, reason: "item_not_found" }, "Шаг не найден — возможно, он изменился."],
    [{ ok: false, reason: "no_if_then" }, "У этого шага нет «если—то»."],
    [{ ok: false, reason: "invalid" }, "Проверьте заполненные поля."],
  ];

  it.each(checkinCases)("maps %o to %s on the check-in surface", (result, expected) => {
    expect(adjustmentResultMessage(result, "checkin")).toBe(expected);
  });

  it.each(reflectionCases)("maps %o to %s on the reflection surface", (result, expected) => {
    expect(adjustmentResultMessage(result, "reflection")).toBe(expected);
  });

  it("says nothing about a day on the weekly surface", () => {
    const duplicate: SavePlanAdjustmentResult = { ok: true, duplicate: true, changedStep: false };
    const stale: SavePlanAdjustmentResult = { ok: false, reason: "stale_token" };
    expect(adjustmentResultMessage(duplicate, "reflection")).not.toContain("Сегодня");
    expect(adjustmentResultMessage(stale, "reflection")).not.toContain("День");
  });
});
