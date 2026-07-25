import { weekStartKey, previousWeekKey } from "@/lib/utils/week-keys";
import { daysBetweenKeys } from "@/lib/utils/date-keys";
import type { CheckinOutcome } from "@/lib/validators/checkin";
import type { PlanAdjustmentDecision } from "@/lib/validators/plan-adjustment";

// Pure metrics module for the "Приборы" instrument page (T2). No DB access,
// no `Date.now()`/`new Date()` — everything that depends on "now" arrives as
// the `todayKey` parameter, so every function here is testable off fixtures
// alone (growth-reactor: the four-week trial reads the DB directly, not pino
// events, so these numbers must be trustworthy on their own).
//
// Week-boundary arithmetic is delegated entirely to weekStartKey/
// previousWeekKey (lib/utils/week-keys.ts) — never reimplemented here, or the
// week boundary on "Приборы" would drift from the boundary used by
// reflections and silently lie. `daysBetweenKeys` (lib/utils/date-keys.ts) is
// the one exception: it's a plain day-count between two already-known date
// keys (no week-boundary logic, no wall-clock read), the same pure primitive
// lib/utils/weekly-review.ts and lib/utils/reminders.ts already rely on —
// needed for the partial-current-week denominator in `checkinCoverage`
// (Decision 3).

// --- Input row shapes (mirror lib/db/schema.ts property names) -------------

export type MetricCheckin = {
  goalId: string;
  date: string;
  outcome: CheckinOutcome;
  feeling: number | null;
  note: string | null;
};

export type MetricReflection = {
  weekStart: string;
  promise: string | null;
  promiseGoalId: string | null;
  prevOutcome: CheckinOutcome | null;
  ifThenItemId: string | null;
};

export type MetricChecklistItem = {
  goalId: string;
  ifThen: { trigger: string; action: string; planType: string } | null;
};

// T16 FIX-7: narrowed to what planAdjustmentMix actually reads. `sourceDate`,
// `source` and `barrier` used to travel here unused — the window is applied by
// the query, and a barrier distribution is deliberately out of scope (T15 D2).
export type MetricPlanAdjustment = {
  decision: PlanAdjustmentDecision;
};

// --- Window -----------------------------------------------------------------

/** `n` Monday-anchored week-start keys ending at the week containing
 *  `todayKey`, oldest first. Built only from weekStartKey/previousWeekKey. */
export function lastNWeekStarts(todayKey: string, n: number): string[] {
  const weeks: string[] = [];
  let current = weekStartKey(todayKey);
  for (let i = 0; i < n; i++) {
    weeks.unshift(current);
    current = previousWeekKey(current);
  }
  return weeks;
}

// --- North Star ---------------------------------------------------------

/** A week's cycle is closed when its reflection has `prevOutcome` set — any
 *  of the three outcomes, including an honest "не в этот раз". `null` means
 *  not closed; silence is not an outcome. One entry per reflection row
 *  passed in (weeks with no saved reflection simply don't appear here — the
 *  caller cross-references against the window's week list). */
export function completedCycles(reflections: MetricReflection[]): {
  weeks: { weekStart: string; completed: boolean }[];
  completed: number;
  total: number;
} {
  const weeks = reflections.map((r) => ({ weekStart: r.weekStart, completed: r.prevOutcome !== null }));
  const completed = weeks.filter((w) => w.completed).length;
  return { weeks, completed, total: weeks.length };
}

/** Distribution of promise outcomes across the given reflections. `unset` =
 *  `prevOutcome === null` (cycle not closed). */
export function promiseOutcomeMix(reflections: MetricReflection[]): {
  done: number;
  partial: number;
  skipped: number;
  unset: number;
} {
  const mix = { done: 0, partial: 0, skipped: 0, unset: 0 };
  for (const r of reflections) {
    if (r.prevOutcome === null) mix.unset += 1;
    else mix[r.prevOutcome] += 1;
  }
  return mix;
}

// --- Check-ins ---------------------------------------------------------

/** Per-week check-in coverage over `weekStarts`. `daysWithCheckin` counts
 *  distinct dates with at least one check-in (several goals checked in on
 *  the same day still count as one day). `daysInWeek` is 7 for any past
 *  week; for the week containing `todayKey` it's the number of elapsed days
 *  (Monday…today inclusive) — an unfinished week must not be scored against
 *  a denominator it hasn't had the chance to fill (Decision 3). */
export function checkinCoverage(
  checkins: MetricCheckin[],
  weekStarts: string[],
  todayKey: string,
): { weekStart: string; daysWithCheckin: number; daysInWeek: number; ratio: number }[] {
  const currentWeek = weekStartKey(todayKey);
  return weekStarts.map((weekStart) => {
    const datesWithCheckin = new Set(
      checkins.filter((c) => weekStartKey(c.date) === weekStart).map((c) => c.date),
    );
    const daysInWeek = weekStart === currentWeek ? daysBetweenKeys(weekStart, todayKey) + 1 : 7;
    const ratio = daysInWeek === 0 ? 0 : datesWithCheckin.size / daysInWeek;
    return { weekStart, daysWithCheckin: datesWithCheckin.size, daysInWeek, ratio };
  });
}

/** Distribution of check-in outcomes across the given check-ins. */
export function checkinOutcomeMix(checkins: MetricCheckin[]): {
  done: number;
  partial: number;
  skipped: number;
  total: number;
} {
  const mix = { done: 0, partial: 0, skipped: 0, total: 0 };
  for (const c of checkins) {
    mix[c.outcome] += 1;
    mix.total += 1;
  }
  return mix;
}

/** Average feeling (1-5) by check-in outcome — is emotion a signal of pace
 *  or noise? Rows without a feeling value are excluded from both the average
 *  and `n`; an outcome with no such rows reports `{ avg: null, n: 0 }`. */
export function feelingByOutcome(checkins: MetricCheckin[]): Record<CheckinOutcome, { avg: number | null; n: number }> {
  const sums: Record<CheckinOutcome, { sum: number; n: number }> = {
    done: { sum: 0, n: 0 },
    partial: { sum: 0, n: 0 },
    skipped: { sum: 0, n: 0 },
  };
  for (const c of checkins) {
    if (c.feeling === null) continue;
    sums[c.outcome].sum += c.feeling;
    sums[c.outcome].n += 1;
  }
  return {
    done: { avg: sums.done.n > 0 ? sums.done.sum / sums.done.n : null, n: sums.done.n },
    partial: { avg: sums.partial.n > 0 ? sums.partial.sum / sums.partial.n : null, n: sums.partial.n },
    skipped: { avg: sums.skipped.n > 0 ? sums.skipped.sum / sums.skipped.n : null, n: sums.skipped.n },
  };
}

// --- Rhythm ---------------------------------------------------------

/** Missed and returned weeks within `windowWeekStarts`, given the set of
 *  weeks that were active. `missed` = window weeks with no activity.
 *  `returns` = an active week immediately preceded by at least one missed
 *  window week; `gapWeeks` is the length of that immediately-preceding
 *  missed run. The window's first week can never be a return — there is no
 *  observed history before it to have missed. */
export function gapsAndReturns(
  activeWeekStarts: string[],
  windowWeekStarts: string[],
): { missed: string[]; returns: { weekStart: string; gapWeeks: number }[] } {
  const activeSet = new Set(activeWeekStarts);
  const missed = windowWeekStarts.filter((w) => !activeSet.has(w));

  const returns: { weekStart: string; gapWeeks: number }[] = [];
  for (let i = 1; i < windowWeekStarts.length; i++) {
    const week = windowWeekStarts[i];
    if (!activeSet.has(week)) continue;
    let gapWeeks = 0;
    for (let j = i - 1; j >= 0 && !activeSet.has(windowWeekStarts[j]); j--) gapWeeks += 1;
    if (gapWeeks > 0) returns.push({ weekStart: week, gapWeeks });
  }
  return { missed, returns };
}

/** "N of the last M weeks" — replaces a zeroable streak with a rolling
 *  count. Consumer arrives in task C1. */
export function rollingConsistency(
  activeWeekStarts: string[],
  windowWeekStarts: string[],
): { active: number; window: number } {
  const activeSet = new Set(activeWeekStarts);
  return { active: windowWeekStarts.filter((w) => activeSet.has(w)).length, window: windowWeekStarts.length };
}

// --- Planning ---------------------------------------------------------

/** Share of checklist steps written as a structured if-then plan versus a
 *  plain task. */
export function ifThenCoverage(items: MetricChecklistItem[]): {
  structured: number;
  total: number;
  ratio: number;
} {
  const structured = items.filter((i) => i.ifThen !== null).length;
  const total = items.length;
  return { structured, total, ratio: total === 0 ? 0 : structured / total };
}

/** "Orphaned" promises: a non-empty `promise` with no `promiseGoalId`. */
export function orphanPromises(reflections: MetricReflection[]): {
  orphans: number;
  withGoal: number;
  totalWithPromise: number;
} {
  let orphans = 0;
  let withGoal = 0;
  for (const r of reflections) {
    if (!r.promise) continue;
    if (r.promiseGoalId === null) orphans += 1;
    else withGoal += 1;
  }
  return { orphans, withGoal, totalWithPromise: orphans + withGoal };
}

// --- Plan adjustments ---------------------------------------------------

/** Distribution of plan-adjustment decisions (T12's "узел сличения") across
 *  the given records, plus the total (Decision D1 — a bare distribution with
 *  no total doesn't read on the page, matching checkinOutcomeMix's shape). */
export function planAdjustmentMix(adjustments: MetricPlanAdjustment[]): {
  keep: number;
  smaller: number;
  change_trigger: number;
  add_coping_plan: number;
  pause_goal: number;
  drop_goal: number;
  total: number;
} {
  const mix = {
    keep: 0,
    smaller: 0,
    change_trigger: 0,
    add_coping_plan: 0,
    pause_goal: 0,
    drop_goal: 0,
    total: 0,
  };
  for (const a of adjustments) {
    mix[a.decision] += 1;
    mix.total += 1;
  }
  return mix;
}

// --- Contract with scripts/metrics-snapshot.mjs (task A2) ------------------

/** Closed, flat list of every numeric indicator "Приборы" shows for the
 *  period — one key per indicator, snake_case. This is the contract task A2
 *  (snapshot freeze) reads against; change it only together with that
 *  script, or the frozen snapshot and the live page will silently diverge. */
export const METRIC_KEYS = [
  "completed_cycles",
  "completed_cycles_total",
  "promise_outcome_done",
  "promise_outcome_partial",
  "promise_outcome_skipped",
  "promise_outcome_unset",
  "checkin_coverage_days",
  "checkin_coverage_window_days",
  "checkin_coverage_ratio",
  "feeling_avg_done",
  "feeling_avg_partial",
  "feeling_avg_skipped",
  "if_then_structured",
  "if_then_total",
  "if_then_coverage_ratio",
  "orphan_promises",
  "promises_with_goal",
  "promises_total",
  "rolling_consistency_active",
  "rolling_consistency_window",
  "plan_adjustment_keep",
  "plan_adjustment_smaller",
  "plan_adjustment_change_trigger",
  "plan_adjustment_add_coping_plan",
  "plan_adjustment_pause_goal",
  "plan_adjustment_drop_goal",
  "plan_adjustments_total",
] as const;
