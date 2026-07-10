import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { checklistItems, contributions, goals } from "@/lib/db/schema";
import { todayKey, toDateKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { computeStreakWeeks } from "@/lib/utils/streak";

/**
 * Set of Monday-anchored week-start keys that had activity — a contribution or
 * a closed checklist step — across the given goals. Ownership is guaranteed by
 * callers deriving `goalIds` from the user's own goals (see below).
 */
async function collectActiveWeeks(goalIds: string[]): Promise<Set<string>> {
  if (goalIds.length === 0) return new Set();

  const [contribRows, doneRows] = await Promise.all([
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
  ]);

  const weeks = new Set<string>();
  // occurredAt is already a "yyyy-MM-dd" string (date column).
  for (const r of contribRows) weeks.add(weekStartKey(r.occurredAt));
  // doneAt is a Date (timestamptz) — normalize to a UTC date key first.
  for (const r of doneRows) if (r.doneAt) weeks.add(weekStartKey(toDateKey(r.doneAt)));
  return weeks;
}

/** Global weekly streak across all of the user's non-deleted goals (any status). */
export async function getGlobalStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt)));
  const weeks = await collectActiveWeeks(rows.map((r) => r.id));
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
