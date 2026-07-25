import { describe, expect, it } from "vitest";

import { paceLabel, type PaceStatus } from "@/lib/utils/pace";

// T10 (PLAN §6 C3). The arithmetic is untouched — what is under test is the
// SENTENCE. Feedback helps on average, but a large share of measured effects
// are negative, and the difference is in the delivery: a forecast someone can
// plan with, rather than a verdict on the person.

describe("paceLabel", () => {
  it("says the same thing three ways, differing only in the tail", () => {
    expect(paceLabel("behind", "12 000 ₽")).toBe(
      "К сроку нужно ~12 000 ₽/мес — это быстрее текущего темпа",
    );
    expect(paceLabel("ahead", "12 000 ₽")).toBe(
      "К сроку нужно ~12 000 ₽/мес — это медленнее текущего темпа",
    );
    expect(paceLabel("on_track", "12 000 ₽")).toBe(
      "К сроку нужно ~12 000 ₽/мес — примерно как сейчас",
    );
  });

  it("inserts the already-formatted amount verbatim", () => {
    // Money is formatted by lib/utils/money.ts alone; this function must not
    // re-format, round, or reorder what it is handed.
    for (const amount of ["$1,234.50", "1 000 000 ₽", "0 ₽"]) {
      expect(paceLabel("behind", amount)).toContain(`~${amount}/мес`);
    }
  });

  it("carries no judgement of the person in any state", () => {
    // An explicit guard: if an evaluative phrasing comes back in a later edit,
    // it fails here rather than shipping.
    const forbidden = ["ускорить", "отстаёте", "отстаете", "опережаете", "график", "!"];
    const statuses: PaceStatus[] = ["behind", "ahead", "on_track"];

    for (const status of statuses) {
      const label = paceLabel(status, "12 000 ₽").toLowerCase();
      for (const word of forbidden) {
        expect(label).not.toContain(word);
      }
    }
  });
});
