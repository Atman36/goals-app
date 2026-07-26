import { describe, expect, it } from "vitest";

import {
  pickTodayStep,
  todayStepCaption,
  type TodayStepCandidate,
} from "@/lib/utils/today-step";

// Home redesign B2. The mockup writes «Шаг на сегодня: 20 минут разговорной
// практики» under the day's question, but no such concept existed in the
// product — nothing picked one checklist item out of a goal and called it
// today's step. These tests pin the rule that now does, including the two
// cases the mockup never drew: a financial goal (no checklist by definition)
// and a goal with nothing open left.

function step(over: Partial<TodayStepCandidate> & { id: string }): TodayStepCandidate {
  return { title: `шаг ${over.id}`, isDone: false, dueDate: null, ...over };
}

describe("pickTodayStep", () => {
  it("picks the only open step of a non-financial goal", () => {
    const result = pickTodayStep([step({ id: "a" })], "non_financial");

    expect(result).toEqual({ id: "a", title: "шаг a", dueDate: null });
  });

  it("prefers the nearest due date over the checklist order", () => {
    const result = pickTodayStep(
      [step({ id: "later", dueDate: "2026-09-01" }), step({ id: "sooner", dueDate: "2026-07-28" })],
      "non_financial",
    );

    expect(result?.id).toBe("sooner");
  });

  it("falls back to checklist order when two steps share a due date", () => {
    const result = pickTodayStep(
      [step({ id: "first", dueDate: "2026-07-28" }), step({ id: "second", dueDate: "2026-07-28" })],
      "non_financial",
    );

    expect(result?.id).toBe("first");
  });

  it("ranks a dated step above an undated one whatever the array order", () => {
    expect(
      pickTodayStep([step({ id: "undated" }), step({ id: "dated", dueDate: "2027-01-01" })], "non_financial")?.id,
    ).toBe("dated");

    expect(
      pickTodayStep([step({ id: "dated", dueDate: "2027-01-01" }), step({ id: "undated" })], "non_financial")?.id,
    ).toBe("dated");
  });

  it("takes the first open step in checklist order when nothing is dated", () => {
    const result = pickTodayStep(
      [step({ id: "a" }), step({ id: "b" }), step({ id: "c" })],
      "non_financial",
    );

    expect(result?.id).toBe("a");
  });

  it("skips done steps, including one that would have won on date", () => {
    const result = pickTodayStep(
      [
        step({ id: "done-and-soonest", isDone: true, dueDate: "2026-01-01" }),
        step({ id: "open", dueDate: "2026-12-31" }),
      ],
      "non_financial",
    );

    expect(result?.id).toBe("open");
  });

  // A financial goal's checklist is empty by definition, so the caption would
  // trail an empty colon. The heading «Как прошёл день?» has to stand alone.
  it("returns null for a financial goal even when open dated steps are passed in", () => {
    expect(pickTodayStep([step({ id: "a", dueDate: "2026-07-28" })], "financial")).toBeNull();
  });

  it("returns null when there are no steps at all", () => {
    expect(pickTodayStep([], "non_financial")).toBeNull();
  });

  it("returns null when every step is done", () => {
    expect(
      pickTodayStep([step({ id: "a", isDone: true }), step({ id: "b", isDone: true })], "non_financial"),
    ).toBeNull();
  });

  it("does not mutate the array it was given", () => {
    const items = [
      step({ id: "late", dueDate: "2026-09-01" }),
      step({ id: "early", dueDate: "2026-07-01" }),
    ];
    const orderBefore = items.map((i) => i.id);

    pickTodayStep(items, "non_financial");

    expect(items.map((i) => i.id)).toEqual(orderBefore);
  });
});

describe("todayStepCaption", () => {
  it("renders the full caption for a step", () => {
    expect(todayStepCaption({ id: "a", title: "20 минут разговорной практики", dueDate: null })).toBe(
      "Шаг на сегодня: 20 минут разговорной практики",
    );
  });

  // Null means "draw no caption at all" — not an empty line, not a dash.
  it("returns null when there is no step to name", () => {
    expect(todayStepCaption(null)).toBeNull();
  });
});
