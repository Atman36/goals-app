import { pluralRu } from "@/lib/utils/plural";

// T8 (PLAN §6 C1). A streak that zeroes on the first miss punishes the miss;
// "3 из 4" describes it. The methodology report (2026-07-25) is direct about
// why this is not cosmetic: a single miss does not undo habit formation, while
// a highlighted broken record lowers later engagement — the counter used to
// hit hardest exactly when returning mattered most. So the number stops
// resetting, and coming back after a gap becomes its own named line instead of
// a hole in a count.
//
// Home redesign (B4, B5, C1, C2) turns the pill into four bars and gives the
// return its own two-line block. Three things are load-bearing there:
//   - the bars come from real weeks, not from a count (B4);
//   - the gap is stated in WEEKS, because weeks are the only unit the rhythm is
//     actually measured in — no "12 дней" query exists and none is worth adding
//     for a sentence (B5);
//   - nothing at all is drawn on day zero. Four empty cells read as a scale
//     someone failed to fill, which is the exact reproach the redesign is meant
//     to remove (C1), and no wording about burning is used, because there is no
//     burning mechanic left to remind anyone of (C2).

/** The rolling window: this week and the three before it. */
export const CONSISTENCY_WINDOW_WEEKS = 4;

/** Fixed wording (Decisions #5): neutral, no fire, no counter, no exclamation
 *  mark. Shown only on the home page. */
export const RETURN_NOTE = "Вернулись после перерыва — это считается";

export type ConsistencyBadgeState = {
  visible: boolean;
  label: string;
  returnNote: string | null;
  /** One entry per bar, oldest week first. Empty while `visible` is false. */
  weeks: { weekStart: string; active: boolean }[];
  /** The factual second line under `returnNote`, in weeks. Null unless this
   *  week is a return AND the gap length is known. */
  returnFact: string | null;
};

export type ConsistencyBadgeInput = {
  activeWeeks: number;
  windowWeeks: number;
  returnedAfterGap: boolean;
  weeks?: { weekStart: string; active: boolean }[];
  returnGapWeeks?: number | null;
};

/** «Вас не было 2 недели. Ритм считается по последним четырём.» — plain fact,
 *  no metaphor. The second sentence is what makes the first one safe to read:
 *  it says the window is rolling, so the gap took nothing away.
 *
 *  THE GAP IS A LOWER BOUND, NOT A MEASUREMENT. `gapWeeks` comes from
 *  `gapsAndReturns`, whose scan never leaves `windowWeekStarts` — so with a
 *  four-week window it can only ever be 1, 2 or 3. Someone who has not opened
 *  the app since April returns with `gapWeeks === 3`. Stating «Вас не было
 *  3 недели» to them is false, and false in the worst possible place: this
 *  copy exists precisely to earn trust by being plain and factual, and it is
 *  read at the moment a person is most likely to give up.
 *
 *  So a gap that fills the entire observable history before this week is
 *  worded as the bound it actually is. Measuring the true gap would need a
 *  `max(week_start)` query across the activity tables, which PLAN B5
 *  deliberately declined — the whole rhythm is measured in weeks, and one
 *  sentence does not justify a new query. Being honest about the bound costs
 *  nothing and keeps that decision intact. */
export function returnFactLine(
  gapWeeks: number,
  windowWeeks: number = CONSISTENCY_WINDOW_WEEKS,
): string {
  const weeksWord = pluralRu(gapWeeks, "неделю", "недели", "недель");
  // The current week occupies the last slot, so the longest run of missed
  // weeks the window can observe before it is windowWeeks - 1.
  const isLowerBound = gapWeeks >= windowWeeks - 1;
  const howLong = isLowerBound
    ? `${gapWeeks} ${weeksWord} или дольше`
    : `${gapWeeks} ${weeksWord}`;
  return `Вас не было ${howLong}. Ритм считается по последним четырём.`;
}

export function consistencyBadgeState(input: ConsistencyBadgeInput): ConsistencyBadgeState {
  // Decisions #4 / C1: "0 из 4" for someone who has just arrived is a reproach
  // dressed as a fact, so nothing is there yet — not the number, and not the
  // four empty bars either.
  const visible = input.activeWeeks > 0;
  // Genitive after «из N последних»: «из 1 последней недели», «из 4 последних
  // недель» — hence "недели" for the one-form and "недель" for both others.
  const weeksWord = pluralRu(input.windowWeeks, "недели", "недель", "недель");
  const gap = input.returnGapWeeks ?? null;
  return {
    visible,
    label: `Активность: ${input.activeWeeks} из ${input.windowWeeks} последних ${weeksWord}`,
    returnNote: input.returnedAfterGap ? RETURN_NOTE : null,
    weeks: visible ? (input.weeks ?? []) : [],
    returnFact:
      input.returnedAfterGap && gap !== null && gap > 0
        ? returnFactLine(gap, input.windowWeeks)
        : null,
  };
}
