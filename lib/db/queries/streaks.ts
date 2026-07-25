import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, checklistItems, contributions, goals, reflections } from "@/lib/db/schema";
import { todayKey, toDateKey } from "@/lib/utils/date-keys";
import { gapsAndReturns, lastNWeekStarts, rollingConsistency } from "@/lib/metrics/definitions";
import { CONSISTENCY_WINDOW_WEEKS } from "@/lib/utils/consistency-badge";
import { weekStartKey } from "@/lib/utils/week-keys";

/** What the badge needs: how many of the last M weeks were active, and whether
 *  this week follows a gap (T8 / PLAN §6 C1 — no zeroing streak any more). */
export type Consistency = {
  activeWeeks: number;
  windowWeeks: number;
  returnedAfterGap: boolean;
};

/**
 * Set of Monday-anchored week-start keys that had activity — a contribution,
 * a closed checklist step, or a saved check-in (any outcome, including
 * "не сегодня" — honest marking is the North-Star action, growth-reactor v5
 * §5/§6/§12) — across the given goals. Ownership is guaranteed by callers
 * deriving `goalIds` from the user's own goals (see below).
 *
 * NOTE — two definitions of "an active week" live in this codebase ON PURPOSE
 * (PLAN §5, caveat 4). This broad one answers "was the person here at all" and
 * feeds the badge. The stricter one in lib/metrics/* counts only a check-in or
 * a reflection, because /metrics answers a different question: "did a cycle of
 * the methodology actually run". Do not reconcile them — collapsing the two
 * silently changes what the four-week trial measures.
 */
async function collectActiveWeeks(goalIds: string[]): Promise<Set<string>> {
  if (goalIds.length === 0) return new Set();

  const [contribRows, doneRows, checkinRows] = await Promise.all([
    db
      .select({ occurredAt: contributions.occurredAt })
      .from(contributions)
      .where(and(inArray(contributions.goalId, goalIds), isNull(contributions.deletedAt))),
    db
      .select({ doneAt: checklistItems.doneAt })
      .from(checklistItems)
      .where(
        and(
          inArray(checklistItems.goalId, goalIds),
          isNull(checklistItems.deletedAt),
          eq(checklistItems.isDone, true),
          isNotNull(checklistItems.doneAt),
        ),
      ),
    db
      .select({ date: checkins.date })
      .from(checkins)
      .where(and(inArray(checkins.goalId, goalIds), isNull(checkins.deletedAt))),
  ]);

  const weeks = new Set<string>();
  // occurredAt is already a "yyyy-MM-dd" string (date column).
  for (const r of contribRows) weeks.add(weekStartKey(r.occurredAt));
  // doneAt is a Date (timestamptz) — normalize to a UTC date key first.
  for (const r of doneRows) if (r.doneAt) weeks.add(weekStartKey(toDateKey(r.doneAt)));
  // checkins.date is already a "yyyy-MM-dd" string (date column), same as occurredAt.
  for (const r of checkinRows) weeks.add(weekStartKey(r.date));
  return weeks;
}

/** Set of week-start keys with a saved reflection for the user — the weekly
 *  reflection ritual is itself global-streak activity (growth-reactor v5
 *  §6/§11/§12 Decisions). Reflections aren't goal-scoped, so unlike
 *  `collectActiveWeeks` this is keyed by userId and only ever feeds the
 *  global streak, never a per-goal one. */
async function collectReflectionWeeks(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ weekStart: reflections.weekStart })
    .from(reflections)
    .where(eq(reflections.userId, userId));

  const weeks = new Set<string>();
  // weekStart is already a "yyyy-MM-dd" string (date column), same as
  // occurredAt/checkins.date above.
  for (const r of rows) weeks.add(weekStartKey(r.weekStart));
  return weeks;
}

/** Turns a set of active weeks into the rolling window the badge shows. The
 *  return marker is the current week appearing in `gapsAndReturns`' returns —
 *  i.e. this week is active and the run of weeks right before it was not. */
function toConsistency(activeWeeks: Set<string>): Consistency {
  const window = lastNWeekStarts(todayKey(), CONSISTENCY_WINDOW_WEEKS);
  const active = [...activeWeeks];
  const { active: activeCount, window: windowSize } = rollingConsistency(active, window);
  const currentWeek = window[window.length - 1];
  const { returns } = gapsAndReturns(active, window);
  return {
    activeWeeks: activeCount,
    windowWeeks: windowSize,
    returnedAfterGap: returns.some((r) => r.weekStart === currentWeek),
  };
}

/** Rolling consistency across all of the user's non-deleted goals (any
 *  status) plus the user's own reflection weeks. */
export async function getGlobalConsistency(userId: string): Promise<Consistency> {
  const rows = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt)));
  const [goalWeeks, reflectionWeeks] = await Promise.all([
    collectActiveWeeks(rows.map((r) => r.id)),
    collectReflectionWeeks(userId),
  ]);
  return toConsistency(new Set([...goalWeeks, ...reflectionWeeks]));
}

/** Rolling consistency for a single goal. Empty when the goal isn't the user's. */
export async function getGoalConsistency(userId: string, goalId: string): Promise<Consistency> {
  const [g] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)));
  if (!g) return toConsistency(new Set());
  return toConsistency(await collectActiveWeeks([goalId]));
}
