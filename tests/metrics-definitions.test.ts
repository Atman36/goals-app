import { describe, expect, it } from "vitest";
import {
  lastNWeekStarts,
  completedCycles,
  checkinCoverage,
  gapsAndReturns,
  feelingByOutcome,
  orphanPromises,
  ifThenCoverage,
  type MetricCheckin,
  type MetricReflection,
  type MetricChecklistItem,
} from "@/lib/metrics/definitions";
import { weekStartKey } from "@/lib/utils/week-keys";

function reflection(partial: Partial<MetricReflection> = {}): MetricReflection {
  return {
    weekStart: "2026-07-06",
    promise: null,
    promiseGoalId: null,
    prevOutcome: null,
    ifThenItemId: null,
    ...partial,
  };
}

function checkin(partial: Partial<MetricCheckin> = {}): MetricCheckin {
  return {
    goalId: "goal-1",
    date: "2026-07-06",
    outcome: "done",
    feeling: 3,
    note: null,
    ...partial,
  };
}

describe("completedCycles", () => {
  it("counts a reflection with prevOutcome set as closed, and one with null as not closed", () => {
    const result = completedCycles([
      reflection({ weekStart: "2026-07-06", prevOutcome: "done" }),
      reflection({ weekStart: "2026-07-13", prevOutcome: null }),
    ]);
    expect(result.weeks).toEqual([
      { weekStart: "2026-07-06", completed: true },
      { weekStart: "2026-07-13", completed: false },
    ]);
    expect(result.completed).toBe(1);
    expect(result.total).toBe(2);
  });

  it("treats prevOutcome 'skipped' (honest 'не в этот раз') as a closed cycle too", () => {
    const result = completedCycles([reflection({ prevOutcome: "skipped" })]);
    expect(result.weeks).toEqual([{ weekStart: "2026-07-06", completed: true }]);
    expect(result.completed).toBe(1);
  });
});

describe("gapsAndReturns", () => {
  it("recognizes a missed gap and a return: active in week 1 and week 4 of a 4-week window", () => {
    const window = ["2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06"];
    const active = ["2026-06-15", "2026-07-06"];
    const result = gapsAndReturns(active, window);
    expect(result.missed).toEqual(["2026-06-22", "2026-06-29"]);
    expect(result.returns).toEqual([{ weekStart: "2026-07-06", gapWeeks: 2 }]);
  });

  it("never marks the window's first week as a return, even when it's active", () => {
    const window = ["2026-06-15", "2026-06-22"];
    const active = ["2026-06-15"];
    const result = gapsAndReturns(active, window);
    expect(result.returns).toEqual([]);
  });
});

describe("checkinCoverage", () => {
  it("counts two check-ins on the same day for different goals as one covered day", () => {
    const result = checkinCoverage(
      [
        checkin({ goalId: "goal-1", date: "2026-06-22" }),
        checkin({ goalId: "goal-2", date: "2026-06-22" }),
      ],
      ["2026-06-22"],
      "2026-06-25",
    );
    expect(result[0].daysWithCheckin).toBe(1);
  });

  it("uses elapsed days as the denominator for the week containing today, and 7 for a past week", () => {
    const today = "2026-07-08"; // Wednesday of the week starting 2026-07-06
    const currentWeekStart = weekStartKey(today);
    const pastWeekStart = "2026-06-29";
    const result = checkinCoverage([], [pastWeekStart, currentWeekStart], today);

    const past = result.find((r) => r.weekStart === pastWeekStart)!;
    const current = result.find((r) => r.weekStart === currentWeekStart)!;
    expect(past.daysInWeek).toBe(7);
    // Monday..Wednesday inclusive = 3 elapsed days.
    expect(current.daysInWeek).toBe(3);
  });
});

describe("feelingByOutcome", () => {
  it("excludes rows without a feeling value from both the average and n", () => {
    const result = feelingByOutcome([
      checkin({ outcome: "done", feeling: 4 }),
      checkin({ outcome: "done", feeling: null }),
    ]);
    expect(result.done).toEqual({ avg: 4, n: 1 });
    expect(result.partial).toEqual({ avg: null, n: 0 });
  });
});

describe("orphanPromises", () => {
  it("counts a promise without promiseGoalId as an orphan, and one with a goal as not", () => {
    const result = orphanPromises([
      reflection({ promise: "Сделать шаг", promiseGoalId: null }),
      reflection({ promise: "Другой шаг", promiseGoalId: "goal-1" }),
    ]);
    expect(result.orphans).toBe(1);
    expect(result.withGoal).toBe(1);
    expect(result.totalWithPromise).toBe(2);
  });
});

describe("ifThenCoverage", () => {
  it("does not count a step with ifThen === null as structured", () => {
    const items: MetricChecklistItem[] = [
      { goalId: "goal-1", ifThen: null },
      { goalId: "goal-1", ifThen: { trigger: "Если утро", action: "То зарядка", planType: "initiation" } },
    ];
    const result = ifThenCoverage(items);
    expect(result.structured).toBe(1);
    expect(result.total).toBe(2);
    expect(result.ratio).toBe(0.5);
  });
});

describe("lastNWeekStarts", () => {
  it("matches week boundaries from lib/utils/week-keys.ts, not a hardcoded date", () => {
    const today = "2026-07-09"; // Thursday
    const weeks = lastNWeekStarts(today, 3);
    expect(weeks).toEqual([
      weekStartKey("2026-06-25"),
      weekStartKey("2026-07-02"),
      weekStartKey(today),
    ]);
    expect(weeks[weeks.length - 1]).toBe(weekStartKey(today));
  });
});
