import { describe, expect, it } from "vitest";

import {
  daysLeftInWeek,
  parsePrevOutcomeParam,
  promiseCardState,
  WEEK_OUTCOME_LABELS,
  type PromiseCardInput,
} from "@/lib/utils/promise-card";
import { previousWeekKey, weekStartKey } from "@/lib/utils/week-keys";

// T6 (PLAN §5 B2). Pure state logic only — no DB, no render. The wording and
// layout rules live in the component; what is asserted here is WHICH card the
// page is asked to show, above all that an unclosed previous week keeps
// showing until an outcome is registered, and stops the moment one is.

// A Monday, so week arithmetic below is derived rather than hand-counted.
const MONDAY = "2026-07-20";
const SUNDAY = "2026-07-26";
const THIS_WEEK = weekStartKey(MONDAY);
const LAST_WEEK = previousWeekKey(THIS_WEEK);

function input(over: Partial<PromiseCardInput> = {}): PromiseCardInput {
  return {
    currentWeek: null,
    previousWeek: null,
    todayKey: MONDAY,
    ...over,
  };
}

describe("promiseCardState", () => {
  it("returns exactly the empty state when there is no reflection at all", () => {
    expect(promiseCardState(input())).toEqual([{ kind: "none" }]);
  });

  it("shows this week's promise with the goal it moves", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: "Три пробежки", prevOutcome: null, goal: { title: "Марафон" } },
      }),
    );

    expect(states).toEqual([
      { kind: "current", promise: "Три пробежки", goalTitle: "Марафон", daysLeft: 6 },
    ]);
  });

  it("asks to close last week when this week has no reflection yet", () => {
    const states = promiseCardState(
      input({
        previousWeek: { promise: "Дописать главу", goal: { title: "Книга" }, weekStart: LAST_WEEK },
      }),
    );

    expect(states[0]).toEqual({
      kind: "unclosed-previous",
      promise: "Дописать главу",
      goalTitle: "Книга",
      weekStart: LAST_WEEK,
    });
  });

  it("keeps asking to close last week while prevOutcome is unset", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: null, prevOutcome: null, goal: null },
        previousWeek: { promise: "Дописать главу", goal: null, weekStart: LAST_WEEK },
      }),
    );

    expect(states[0]?.kind).toBe("unclosed-previous");
  });

  it("stops asking once the outcome is «не в этот раз» — an honest skip closes the cycle", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: null, prevOutcome: "skipped", goal: null },
        previousWeek: { promise: "Дописать главу", goal: null, weekStart: LAST_WEEK },
      }),
    );

    expect(states.some((s) => s.kind === "unclosed-previous")).toBe(false);
    expect(states).toEqual([{ kind: "none" }]);
  });

  it.each(["done", "partial", "skipped"])("outcome %s closes the cycle", (outcome) => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: null, prevOutcome: outcome, goal: null },
        previousWeek: { promise: "Дописать главу", goal: null, weekStart: LAST_WEEK },
      }),
    );

    expect(states.some((s) => s.kind === "unclosed-previous")).toBe(false);
  });

  it("shows both blocks when last week is open and this week already has a promise", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: "Три пробежки", prevOutcome: null, goal: { title: "Марафон" } },
        previousWeek: { promise: "Дописать главу", goal: { title: "Книга" }, weekStart: LAST_WEEK },
      }),
    );

    expect(states.map((s) => s.kind)).toEqual(["unclosed-previous", "current"]);
  });

  it("falls back to no-goal-link when the promise's goal is gone", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: "Три пробежки", prevOutcome: null, goal: null },
      }),
    );

    expect(states).toEqual([{ kind: "no-goal-link", promise: "Три пробежки", daysLeft: 6 }]);
  });

  it("treats an empty promise as no promise", () => {
    const states = promiseCardState(
      input({
        currentWeek: { promise: "   ", prevOutcome: null, goal: { title: "Марафон" } },
        previousWeek: { promise: "", goal: null, weekStart: LAST_WEEK },
      }),
    );

    expect(states).toEqual([{ kind: "none" }]);
  });
});

describe("daysLeftInWeek", () => {
  it("counts Monday as 6 and Sunday as 0", () => {
    expect(daysLeftInWeek(MONDAY)).toBe(6);
    expect(daysLeftInWeek(SUNDAY)).toBe(0);
  });

  it("walks the whole week down to zero", () => {
    const [y, m, d] = MONDAY.split("-").map(Number);
    const seen = Array.from({ length: 7 }, (_, i) =>
      daysLeftInWeek(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)),
    );

    expect(seen).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });

  it("reports the same number that the card renders for the current week", () => {
    // Guards against an off-by-one that would silently promise an extra day.
    expect(daysLeftInWeek(THIS_WEEK)).toBe(6);
  });
});

describe("parsePrevOutcomeParam", () => {
  it("accepts the three outcomes the card links to", () => {
    for (const outcome of ["done", "partial", "skipped"] as const) {
      expect(parsePrevOutcomeParam(outcome)).toBe(outcome);
    }
  });

  it("ignores anything else in silence", () => {
    for (const bad of [undefined, "", "DONE", "выполнено", "done; drop", ["done", "partial"]]) {
      expect(parsePrevOutcomeParam(bad)).toBeNull();
    }
  });
});

describe("WEEK_OUTCOME_LABELS", () => {
  it("says «не в этот раз» for a week, not the day's «не сегодня»", () => {
    // PLAN §6 C6: the day/week wording differs on purpose and is frozen until
    // «Приложение D» — this test fails if someone unifies them by hand.
    expect(WEEK_OUTCOME_LABELS.skipped).toBe("Не в этот раз");
  });
});
