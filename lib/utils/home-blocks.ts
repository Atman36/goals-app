import type { CheckinOutcome } from "@/lib/validators/checkin";

// Home redesign B3. The mockup ships six screen states as an `enum`, and they
// exclude each other by construction: «возвращение» forces "no promise this
// week", «незакрытая неделя» forces "day not marked". Real days do not behave
// like that — somebody back after three weeks almost certainly has an unclosed
// promise waiting, and a marked day can perfectly well sit under an unclosed
// week. Rendering an enum would leave roughly half of real days uncovered.
//
// So the home page is a composition of independent blocks, each with its own
// condition, and this module is the single place those conditions live. There
// is no screen-state switch anywhere in the page.
//
// Pure, so the combinations the mockup never drew can be pinned in tests
// instead of being discovered live: 05+06, 03+06, day zero, no goals at all,
// and an honest "partial" whose adjustment node is muted by the 72-hour
// cooldown.

export type HomeBlocksInput = {
  /** Any active goal at all. False ⇒ the day card has nothing to ask about. */
  hasGoals: boolean;
  /** A live, active цель №1 is set. */
  hasFocusGoal: boolean;
  /** Today's check-in for the focus goal already exists. */
  checkedInToday: boolean;
  /** consistencyBadgeState(...).visible — false on day zero (C1). */
  rhythmVisible: boolean;
  /** This week is a return after a gap. */
  returnedAfterGap: boolean;
  /** A promise is set for the current week. */
  hasCurrentPromise: boolean;
  /** Last week's promise never got an outcome. */
  hasUnclosedPromise: boolean;
};

export type DayCardMode =
  /** No goals exist yet — the card invites creating the first one (B6). */
  | "no-goals"
  /** Goals exist but no цель №1 — the card is the focus picker. */
  | "pick-focus"
  /** Focus goal set, today not marked — «Как прошёл день?» + three outcomes. */
  | "ask"
  /** Today already marked — the recorded outcome and «изменить». */
  | "recorded";

export type HomeBlocks = {
  dayCard: DayCardMode;
  /** The neutral return block above the day's question. */
  showReturnBlock: boolean;
  /** «Цель №1 всё ещё …» — offered on return, when priorities may have moved. */
  showFocusSwitchLine: boolean;
  /** The «закрыть прошлую неделю» band, its own block under the day card. */
  showUnclosedPromise: boolean;
  /** The «Неделя» card as a whole. */
  showWeekBlock: boolean;
  /** The four bars + their label, inside «Неделя». */
  showRhythm: boolean;
  /** The «Куда это ведёт» card with the goal rows. */
  showGoalsBlock: boolean;
};

export function homeBlocks(input: HomeBlocksInput): HomeBlocks {
  const dayCard: DayCardMode = !input.hasGoals
    ? "no-goals"
    : !input.hasFocusGoal
      ? "pick-focus"
      : input.checkedInToday
        ? "recorded"
        : "ask";

  return {
    dayCard,
    // Deliberately NOT tied to dayCard. A return can land on a day that is
    // already marked, and on a day with no цель №1 at all — the activity that
    // ended the gap may have been a contribution or a reflection.
    showReturnBlock: input.hasGoals && input.returnedAfterGap,
    showFocusSwitchLine: input.hasFocusGoal && input.returnedAfterGap,
    // Independent of everything above: this is B3's 05+06 and 03+06.
    showUnclosedPromise: input.hasUnclosedPromise,
    // C1: on day zero there is no rhythm AND no promise (saving a reflection is
    // itself an active week), so the block collapses to nothing and is dropped
    // whole rather than drawn as four empty cells.
    showWeekBlock: input.hasGoals && (input.rhythmVisible || input.hasCurrentPromise),
    // Gated on hasGoals too, or the two fields disagree: archive your last
    // active goal and the week still counts as active (getGlobalConsistency
    // reads goals of ANY status), so rhythmVisible stays true while the block
    // that would contain the bars is gone. Every field here means "this is on
    // screen"; a field that means "it would be, if its parent were" is a
    // contract someone will eventually read wrong.
    showRhythm: input.hasGoals && input.rhythmVisible,
    showGoalsBlock: input.hasGoals,
  };
}

/** How many goal rows «Куда это ведёт» shows before deferring to /goals. */
export const HOME_GOAL_ROWS = 4;

/**
 * The goal rows on the home page: цель №1 first, then the rest in the order
 * they arrived (listGoals already sorts by deadline), capped at `limit`.
 *
 * `hiddenCount` is what the «все цели» link has left to offer. The home page
 * answers «что сегодня»; the full list, its filters and its archive live on
 * /goals, so this is a teaser and is allowed to be short.
 */
export function orderHomeGoalRows<T extends { id: string }>(
  goals: T[],
  focusGoalId: string | null,
  limit: number = HOME_GOAL_ROWS,
): { rows: T[]; hiddenCount: number } {
  const focus = focusGoalId ? goals.filter((g) => g.id === focusGoalId) : [];
  const rest = goals.filter((g) => g.id !== focusGoalId);
  const ordered = [...focus, ...rest];
  return { rows: ordered.slice(0, limit), hiddenCount: Math.max(0, ordered.length - limit) };
}

/**
 * Whether the plan-adjustment node belongs under today's check-in (B7).
 *
 * The mockup shows state 04 unconditionally, but `shouldPromptAdjustment`
 * mutes the node for 72 hours after the previous adjustment. Under that
 * cooldown an honest «частично» shows only the recorded outcome and «изменить»
 * — exactly like a «сделал» day. `prompted` is the cooldown's answer and can
 * only be computed against the client's clock, so the caller supplies it.
 */
export function shouldShowAdjustmentNode(input: {
  outcome: CheckinOutcome | null;
  prompted: boolean;
}): boolean {
  if (input.outcome !== "partial" && input.outcome !== "skipped") return false;
  return input.prompted;
}
