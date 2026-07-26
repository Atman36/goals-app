import { pluralRu } from "@/lib/utils/plural";
import type { returnRhythm } from "@/lib/metrics/definitions";

// B5 (PLAN §5 B5). The wording of "возврат после пропуска" lives here, not
// inline in app/(app)/metrics/page.tsx, for the same reason
// lib/utils/consistency-badge.ts exists: the page is a server component over a
// live database, so a string built inside it can only be checked by opening it
// with the right data in the DB — and the live database has none. That is how
// «возврат после 2» (a number with no noun) shipped and survived a review.
//
// Tone is fixed by C1/Q5.2 and matches RETURN_NOTE on «Сегодня»: a return is
// named, never praised; a gap is named, never scolded. No fire, no counters,
// no exclamation marks.

/** Genitive after «после N»: «1 недели», «2 недель», «5 недель». */
function weeksGenitive(n: number): string {
  return pluralRu(n, "недели", "недель", "недель");
}

/** Nominative after a bare number: «1 неделя», «2 недели», «5 недель». */
function weeksNominative(n: number): string {
  return pluralRu(n, "неделя", "недели", "недель");
}

/** The per-week cell of the «Пропуск / возврат» column. `returnGapWeeks` is
 *  the length of the missed run immediately before an active week (undefined
 *  when the week is not a return). A week is never both. */
export function gapCellLabel(input: { missed: boolean; returnGapWeeks?: number }): string {
  if (input.missed) return "пропуск";
  if (input.returnGapWeeks === undefined) return "—";
  return `возврат после ${input.returnGapWeeks} ${weeksGenitive(input.returnGapWeeks)}`;
}

/** The period summary under «Сводка за период». `headline` puts returns and
 *  missed weeks side by side as two plain facts; `hint` explains what a return
 *  is, and — once there is one — how long the longest returned-from gap was
 *  (DECISION-RULE.md §4 point 5's «время возврата»). */
export function returnRhythmSummary(rhythm: ReturnType<typeof returnRhythm>): {
  headline: string;
  hint: string;
} {
  const headline = `Возвраты после перерыва: ${rhythm.returns} · пропущено недель: ${rhythm.missedWeeks}`;
  const hint =
    rhythm.returns === 0
      ? "Возврат — первая активная неделя после пропущенной. Пропуск при этом ничего не обнуляет. За период возвратов не было."
      : `Возврат — первая активная неделя после пропущенной. Самый долгий перерыв, после которого был возврат: ${rhythm.longestReturnGap} ${weeksNominative(rhythm.longestReturnGap)}. Первая неделя окна возвратом считаться не может — до неё истории не наблюдали.`;
  return { headline, hint };
}
