import { describe, expect, it } from "vitest";
import { gapCellLabel, returnRhythmSummary } from "@/lib/utils/return-rhythm-labels";
import { RETURN_NOTE } from "@/lib/utils/consistency-badge";
import { returnRhythm } from "@/lib/metrics/definitions";

// B5. The «Приборы» page is a server component over a live database, so these
// strings cannot be checked by opening the page unless the database happens to
// hold the right history — which is exactly how «возврат после 2» (a number
// with no noun) shipped. The wording lives in a pure module for this reason.

describe("gapCellLabel", () => {
  it("gives a missed week its own word, never a zero", () => {
    expect(gapCellLabel({ missed: true })).toBe("пропуск");
  });

  it("says nothing about an ordinary active week", () => {
    expect(gapCellLabel({ missed: false })).toBe("—");
  });

  it("always names the unit after the number", () => {
    expect(gapCellLabel({ missed: false, returnGapWeeks: 1 })).toBe("возврат после 1 недели");
    expect(gapCellLabel({ missed: false, returnGapWeeks: 2 })).toBe("возврат после 2 недель");
    expect(gapCellLabel({ missed: false, returnGapWeeks: 5 })).toBe("возврат после 5 недель");
    expect(gapCellLabel({ missed: false, returnGapWeeks: 11 })).toBe("возврат после 11 недель");
  });

  it("never ends on a bare digit — the defect this module exists to prevent", () => {
    for (let weeks = 1; weeks <= 12; weeks++) {
      expect(gapCellLabel({ missed: false, returnGapWeeks: weeks })).toMatch(/недел[иь]$/);
    }
  });

  it("prefers 'пропуск' when a week is somehow marked both ways", () => {
    expect(gapCellLabel({ missed: true, returnGapWeeks: 3 })).toBe("пропуск");
  });
});

describe("returnRhythmSummary", () => {
  it("puts returns and missed weeks side by side as two plain facts", () => {
    const { headline } = returnRhythmSummary({ missedWeeks: 2, returns: 1, longestReturnGap: 2 });
    expect(headline).toBe("Возвраты после перерыва: 1 · пропущено недель: 2");
  });

  it("tells 'no returns yet' apart from 'returned instantly'", () => {
    // Both cases carry longestReturnGap = 0; only the hint can distinguish
    // them, and criterion 5 of DECISION-RULE.md §4 is read off exactly this.
    const none = returnRhythmSummary({ missedWeeks: 3, returns: 0, longestReturnGap: 0 });
    const some = returnRhythmSummary({ missedWeeks: 3, returns: 2, longestReturnGap: 1 });

    expect(none.hint).toContain("возвратов не было");
    expect(some.hint).toContain("Самый долгий перерыв");
    expect(some.hint).toContain("1 неделя");
  });

  it("declines «неделя» correctly in the longest-gap sentence", () => {
    const forGap = (n: number) =>
      returnRhythmSummary({ missedWeeks: n, returns: 1, longestReturnGap: n }).hint;
    expect(forGap(1)).toContain("возврат: 1 неделя");
    expect(forGap(3)).toContain("возврат: 3 недели");
    expect(forGap(5)).toContain("возврат: 5 недель");
  });

  it("stays neutral: no praise, no scolding, no exclamation marks", () => {
    const texts = [
      returnRhythmSummary({ missedWeeks: 0, returns: 0, longestReturnGap: 0 }),
      returnRhythmSummary({ missedWeeks: 4, returns: 2, longestReturnGap: 3 }),
    ].flatMap((s) => [s.headline, s.hint]);

    for (const text of texts) {
      expect(text).not.toMatch(/[!🔥]/);
      expect(text.toLowerCase()).not.toMatch(/молодец|отлично|срыв|провал|наконец|увы/);
    }
  });

  it("reads as the same event «Сегодня» announces — a return that counts", () => {
    // The two surfaces must not drift into different vocabularies for one
    // event (PLAN §5 B5: «Приборы» — колонка, «Сегодня» — строка).
    expect(RETURN_NOTE).toContain("Вернулись после перерыва");
    expect(returnRhythmSummary({ missedWeeks: 1, returns: 1, longestReturnGap: 1 }).headline).toContain(
      "после перерыва",
    );
  });

  it("matches what returnRhythm actually produces for a real window", () => {
    const window = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"];
    const summary = returnRhythmSummary(returnRhythm(["2026-06-01", "2026-06-22"], window));
    expect(summary.headline).toBe("Возвраты после перерыва: 1 · пропущено недель: 2");
    expect(summary.hint).toContain("возврат: 2 недели");
  });
});
