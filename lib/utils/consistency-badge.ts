import { pluralRu } from "@/lib/utils/plural";

// T8 (PLAN §6 C1). A streak that zeroes on the first miss punishes the miss;
// "3 из 4" describes it. The methodology report (2026-07-25) is direct about
// why this is not cosmetic: a single miss does not undo habit formation, while
// a highlighted broken record lowers later engagement — the counter used to
// hit hardest exactly when returning mattered most. So the number stops
// resetting, and coming back after a gap becomes its own named line instead of
// a hole in a count.

/** The rolling window: this week and the three before it. */
export const CONSISTENCY_WINDOW_WEEKS = 4;

/** Fixed wording (Decisions #5): neutral, no fire, no counter, no exclamation
 *  mark. Shown only on «Сегодня». */
export const RETURN_NOTE = "Вернулись после перерыва — это считается";

export type ConsistencyBadgeState = {
  visible: boolean;
  label: string;
  returnNote: string | null;
};

export function consistencyBadgeState(input: {
  activeWeeks: number;
  windowWeeks: number;
  returnedAfterGap: boolean;
}): ConsistencyBadgeState {
  // Decisions #4: "0 из 4" for someone who has just arrived is a reproach
  // dressed as a fact, so the badge simply isn't there yet.
  const visible = input.activeWeeks > 0;
  // Genitive after «из N последних»: «из 1 последней недели», «из 4 последних
  // недель» — hence "недели" for the one-form and "недель" for both others.
  const weeksWord = pluralRu(input.windowWeeks, "недели", "недель", "недель");
  return {
    visible,
    label: `Активность: ${input.activeWeeks} из ${input.windowWeeks} последних ${weeksWord}`,
    returnNote: input.returnedAfterGap ? RETURN_NOTE : null,
  };
}
