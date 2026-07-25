import { daysBetweenKeys, type DateKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { checkinOutcomeValues, type CheckinOutcome } from "@/lib/validators/checkin";

// T6 (PLAN §5 B2): the weekly promise has to exist for the person between one
// Monday and the next, not only on /reflections. This module holds the *logic*
// of what /today should show about the promise — a pure function over already
// fetched rows, so the four states are testable without a DB or a render.
//
// Tone constraint from the methodology report (2026-07-25): a reminder, not a
// permanently visible unpaid debt. Hence a compact card that leads on tap —
// the wording rules live in components/goals/weekly-promise-card.tsx.

/** Week-level outcome wording, used by the "close the cycle" buttons.
 *
 *  Deliberately NOT lib/checkin-labels.ts' OUTCOME_LABELS: a *day*'s `skipped`
 *  reads «Не сегодня», a *week*'s promise reads «Не в этот раз». PLAN §6 C6
 *  records that difference as intentional and freezes it until «Приложение D»
 *  arrives (E4), so the two vocabularies stay separate on purpose. */
export const WEEK_OUTCOME_LABELS: Record<CheckinOutcome, string> = {
  done: "Сделал",
  partial: "Частично",
  skipped: "Не в этот раз",
};

/** The `?prevOutcome=` deep link behind /today's "close the cycle" buttons.
 *
 *  Lives here rather than in the page so it can be tested without booting a
 *  server component. Anything unrecognised — a typo, a stale link, a hand-typed
 *  value — is ignored in silence: the parameter only preselects a radio, it is
 *  never written anywhere, and the save still goes through the form's own
 *  action and validator. */
export function parsePrevOutcomeParam(
  value: string | string[] | undefined,
): CheckinOutcome | null {
  return typeof value === "string" && (checkinOutcomeValues as readonly string[]).includes(value)
    ? (value as CheckinOutcome)
    : null;
}

export type PromiseCardState =
  /** Last week's promise never got an outcome. Rendered FIRST on the page,
   *  above everything else — registering the outcome (including an honest
   *  "не в этот раз") is what closes a cycle, the product's North Star. */
  | { kind: "unclosed-previous"; promise: string; goalTitle: string | null; weekStart: string }
  /** This week's promise, with the goal it moves. */
  | { kind: "current"; promise: string; goalTitle: string | null; daysLeft: number }
  /** This week's promise, but its goal is gone (absent or soft-deleted). */
  | { kind: "no-goal-link"; promise: string; daysLeft: number }
  /** No promise for this week. */
  | { kind: "none" };

export type PromiseCardInput = {
  /** This week's reflection row, if saved. `prevOutcome` records the fate of
   *  the PREVIOUS week's promise — that is what closes the cycle below. */
  currentWeek: {
    promise: string | null;
    prevOutcome: string | null;
    goal: { title: string } | null;
  } | null;
  /** The latest reflection strictly before this week, if any. */
  previousWeek: { promise: string | null; goal: { title: string } | null; weekStart: string } | null;
  todayKey: DateKey;
};

/** A blank or whitespace-only promise is no promise at all — the DB column is
 *  nullable and historic rows predate the validator's trim/min(1). */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Whole days from `today` to the Sunday that ends its week, inclusive:
 *  Monday → 6, Sunday → 0. Descriptive, not a countdown — the card never
 *  colours or emphasises it (Decisions #7). */
export function daysLeftInWeek(today: DateKey): number {
  return 6 - daysBetweenKeys(weekStartKey(today), today);
}

/** What /today shows about the weekly promise, in render order.
 *
 *  Returns an ARRAY because "last week is still open" and "this week already
 *  has a promise" are both true at the start of most weeks; `unclosed-previous`
 *  always comes first. Exactly one of `current` / `no-goal-link` / `none`
 *  always follows it. */
export function promiseCardState(input: PromiseCardInput): PromiseCardState[] {
  const states: PromiseCardState[] = [];

  const previous = input.previousWeek;
  if (previous) {
    const previousPromise = nonEmpty(previous.promise);
    // An outcome of ANY kind closes the cycle — "не в этот раз" is a result,
    // not a miss, so it must not leave the prompt hanging around.
    const cycleClosed = input.currentWeek?.prevOutcome != null;
    if (previousPromise && !cycleClosed) {
      states.push({
        kind: "unclosed-previous",
        promise: previousPromise,
        goalTitle: nonEmpty(previous.goal?.title),
        weekStart: previous.weekStart,
      });
    }
  }

  const currentPromise = nonEmpty(input.currentWeek?.promise);
  if (!currentPromise) {
    states.push({ kind: "none" });
    return states;
  }

  const daysLeft = daysLeftInWeek(input.todayKey);
  const goalTitle = nonEmpty(input.currentWeek?.goal?.title);
  states.push(
    goalTitle
      ? { kind: "current", promise: currentPromise, goalTitle, daysLeft }
      : { kind: "no-goal-link", promise: currentPromise, daysLeft },
  );
  return states;
}
