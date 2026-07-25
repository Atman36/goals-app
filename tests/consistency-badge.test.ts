import { describe, expect, it } from "vitest";

import {
  consistencyBadgeState,
  CONSISTENCY_WINDOW_WEEKS,
  RETURN_NOTE,
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
