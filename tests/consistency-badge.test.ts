import { describe, expect, it } from "vitest";

import {
  consistencyBadgeState,
  CONSISTENCY_WINDOW_WEEKS,
  RETURN_NOTE,
  returnFactLine,
} from "@/lib/utils/consistency-badge";

// T8 (PLAN §6 C1). The old badge zeroed on the first miss; these tests pin the
// replacement — a rolling count that describes rather than punishes, and a
// return after a gap that is named instead of being a hole in a number.

function state(over: Partial<Parameters<typeof consistencyBadgeState>[0]> = {}) {
  return consistencyBadgeState({
    activeWeeks: 3,
    windowWeeks: CONSISTENCY_WINDOW_WEEKS,
    returnedAfterGap: false,
    ...over,
  });
}

describe("consistencyBadgeState", () => {
  it("hides itself entirely when nothing is active yet", () => {
    // «0 из 4» to a brand-new user is a reproach dressed as a fact.
    expect(state({ activeWeeks: 0 }).visible).toBe(false);
  });

  it("shows N of the window once there is any activity", () => {
    const result = state({ activeWeeks: 3, windowWeeks: 4 });

    expect(result.visible).toBe(true);
    expect(result.label).toContain("3 из 4");
    expect(result.label).toBe("Активность: 3 из 4 последних недель");
  });

  it("never says «подряд» — the streak wording is gone", () => {
    expect(state({ activeWeeks: 4 }).label).not.toContain("подряд");
  });

  it("leaves the return note empty when this week follows an active one", () => {
    expect(state({ returnedAfterGap: false }).returnNote).toBeNull();
  });

  it("names the return after a gap in exactly the agreed words", () => {
    expect(state({ returnedAfterGap: true }).returnNote).toBe(
      "Вернулись после перерыва — это считается",
    );
    expect(RETURN_NOTE).toBe("Вернулись после перерыва — это считается");
  });

  // The window is a constant (4), so only the "недель" form is ever rendered
  // in the product. The other sizes are pinned anyway: the day someone widens
  // the window, a wrong ending should fail here rather than ship.
  it.each([
    [1, "недели"],
    [2, "недель"],
    [4, "недель"],
    [5, "недель"],
    [11, "недель"],
    [21, "недели"],
  ])("declines the noun correctly for a window of %i", (windowWeeks, noun) => {
    expect(state({ activeWeeks: 1, windowWeeks }).label.endsWith(` ${noun}`)).toBe(true);
  });

  it("renders the real window exactly as agreed", () => {
    expect(state({ activeWeeks: 2, windowWeeks: CONSISTENCY_WINDOW_WEEKS }).label).toBe(
      "Активность: 2 из 4 последних недель",
    );
  });
});

// Home redesign B4/B5/C1/C2. The flame pill became four bars, so the state now
// carries the actual weeks rather than only a count, and the return after a gap
// gets a factual second line measured in weeks.
describe("consistencyBadgeState — the four bars", () => {
  const window = [
    { weekStart: "2026-07-06", active: true },
    { weekStart: "2026-07-13", active: false },
    { weekStart: "2026-07-20", active: true },
    { weekStart: "2026-07-27", active: true },
  ];

  it("passes the weeks through so a filled bar always names a real week", () => {
    expect(state({ activeWeeks: 3, weeks: window }).weeks).toEqual(window);
  });

  // Four empty cells read as a scale someone failed to fill — the exact
  // reproach the rolling window removed. Day zero draws no bars at all.
  it("drops the bars entirely on day zero, even if weeks were supplied", () => {
    const result = state({ activeWeeks: 0, weeks: window });

    expect(result.visible).toBe(false);
    expect(result.weeks).toEqual([]);
  });

  it("defaults to no bars when the caller supplies none", () => {
    expect(state({ activeWeeks: 3 }).weeks).toEqual([]);
  });
});

describe("consistencyBadgeState — the return line", () => {
  it("says nothing factual when this week does not follow a gap", () => {
    expect(state({ returnedAfterGap: false, returnGapWeeks: 3 }).returnFact).toBeNull();
  });

  it.each([[null], [undefined], [0]])(
    "says nothing factual when the gap length is %s",
    (gap) => {
      expect(state({ returnedAfterGap: true, returnGapWeeks: gap }).returnFact).toBeNull();
    },
  );

  it("states a gap the window can actually measure as an exact number", () => {
    expect(state({ returnedAfterGap: true, returnGapWeeks: 2 }).returnFact).toBe(
      "Вас не было 2 недели. Ритм считается по последним четырём.",
    );
  });

  // The gap scan never leaves the four-week window (lib/metrics/definitions.ts
  // `gapsAndReturns`), so gapWeeks is structurally capped at 3 — a three-MONTH
  // absence arrives here as 3. Printing «Вас не было 3 недели» would be a plain
  // false statement, in the one piece of copy whose entire job is to be plainly
  // factual, read at the moment a person is most likely to give up.
  it("states a window-saturated gap as a lower bound, never as a measurement", () => {
    expect(state({ returnedAfterGap: true, returnGapWeeks: 3, windowWeeks: 4 }).returnFact).toBe(
      "Вас не было 3 недели или дольше. Ритм считается по последним четырём.",
    );
  });

  it("does not hedge a gap that is strictly inside the window", () => {
    for (const gap of [1, 2]) {
      expect(state({ returnedAfterGap: true, returnGapWeeks: gap, windowWeeks: 4 }).returnFact).not.toContain(
        "или дольше",
      );
    }
  });

  it("moves the lower-bound boundary with the window size", () => {
    // Widen the window and 3 stops being the cap, so it stops being hedged.
    expect(returnFactLine(3, 8)).toBe("Вас не было 3 недели. Ритм считается по последним четырём.");
    expect(returnFactLine(7, 8)).toContain("7 недель или дольше");
  });

  // Only gaps of 1–3 are reachable with the current window. The other sizes are
  // pinned anyway, on the same reasoning as the window-declension test above:
  // the day someone widens the window, a wrong ending should fail here rather
  // than ship. A window is passed explicitly so these stay un-hedged.
  it.each([
    [1, "неделю"],
    [2, "недели"],
    [3, "недели"],
    [5, "недель"],
    [11, "недель"],
    [21, "неделю"],
  ])("declines the noun correctly for a gap of %i", (gap, noun) => {
    expect(returnFactLine(gap, gap + 2).startsWith(`Вас не было ${gap} ${noun}.`)).toBe(true);
  });

  // C2: the mockup's «Ничего не сгорело» was rejected because it reintroduces
  // a burning mechanic the product does not have — and does it at the most
  // vulnerable moment, when someone has just come back.
  it("never mentions burning, in either line", () => {
    const result = state({ returnedAfterGap: true, returnGapWeeks: 3 });

    for (const line of [result.returnNote, result.returnFact]) {
      expect(line).not.toBeNull();
      expect(line).not.toMatch(/сгорел/i);
      expect(line).not.toMatch(/огон/i);
    }
    expect(result.returnNote).toBe(RETURN_NOTE);
  });
});
