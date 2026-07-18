import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, checklistItems, contributions, goals, reflections } from "@/lib/db/schema";
import { todayKey, toDateKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { computeStreakWeeks } from "@/lib/utils/streak";

/**
 * Set of Monday-anchored week-start keys that had activity — a contribution,
 * a closed checklist step, or a saved check-in (any outcome, including
 * "не сегодня" — honest marking is the North-Star action, growth-reactor v5
 * §5/§6/§12) — across the given goals. Ownership is guaranteed by callers
 * deriving `goalIds` from the user's own goals (see below).
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

/** Global weekly streak across all of the user's non-deleted goals (any
 *  status) plus the user's own reflection weeks. */
export async function getGlobalStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt)));
  const [goalWeeks, reflectionWeeks] = await Promise.all([
    collectActiveWeeks(rows.map((r) => r.id)),
    collectReflectionWeeks(userId),
  ]);
  const weeks = new Set([...goalWeeks, ...reflectionWeeks]);
  return computeStreakWeeks(weeks, weekStartKey(todayKey()));
}

/** Weekly streak for a single goal. Returns 0 when the goal isn't the user's. */
export async function getGoalStreak(userId: string, goalId: string): Promise<number> {
  const [g] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)));
  if (!g) return 0;
  const weeks = await collectActiveWeeks([goalId]);
  return computeStreakWeeks(weeks, weekStartKey(todayKey()));
}
