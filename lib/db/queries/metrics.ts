import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, checklistItems, goals, reflections } from "@/lib/db/schema";
import { listPlanAdjustmentsForUser } from "@/lib/db/queries/plan-adjustments";
import type {
  MetricCheckin,
  MetricChecklistItem,
  MetricPlanAdjustment,
  MetricReflection,
} from "@/lib/metrics/definitions";

/** Raw rows for the "Приборы" instrument page, scoped to `userId` and
 *  soft-delete filtered per the app's data-access conventions — ownership
 *  join idiom copied from listCheckinsForGoal (lib/db/queries/checkins.ts).
 *  Feeds the pure functions in lib/metrics/definitions.ts; this is the only
 *  DB touchpoint the page needs.
 *
 *  - checkins: only the user's goals, not soft-deleted, dated on/after the
 *    window's first week — no upper bound needed, a check-in is always dated
 *    "today" at creation time (lib/validators/checkin.ts's day-token
 *    contract), so it can never fall after the window's current week.
 *  - reflections: this table has no `deletedAt` (schema.ts: it's a hard row,
 *    upserted by (user_id, week_start)) — matched by `weekStart` exactly
 *    against the window's week-start keys instead.
 *  - checklistItems: the user's live steps under live goals, NOT bounded by
 *    the window — if-then coverage is measured over all current steps, not
 *    just ones touched during the window (T2 Step 2 decision).
 *  - planAdjustments (T15): sourced from listPlanAdjustmentsForUser, which
 *    already centralizes the userId scope and `deletedAt IS NULL` filter
 *    (AGENTS.md) — no separate hand-rolled select on this table here, since
 *    that duplication is exactly what let the weekly snapshot once count
 *    another user's rows (T11). Windowed from the earliest `weekStarts`
 *    entry, same as checkins; an empty `weekStarts` skips the query. */
export async function getMetricsData(
  userId: string,
  weekStarts: string[],
): Promise<{
  checkins: MetricCheckin[];
  reflections: MetricReflection[];
  checklistItems: MetricChecklistItem[];
  planAdjustments: MetricPlanAdjustment[];
}> {
  const windowStart = weekStarts[0];

  const [checkinRows, reflectionRows, checklistRows, planAdjustmentRows] = await Promise.all([
    db
      .select({
        goalId: checkins.goalId,
        date: checkins.date,
        outcome: checkins.outcome,
        feeling: checkins.feeling,
        note: checkins.note,
      })
      .from(checkins)
      .innerJoin(goals, eq(goals.id, checkins.goalId))
      .where(
        and(
          isNull(checkins.deletedAt),
          eq(goals.userId, userId),
          isNull(goals.deletedAt),
          gte(checkins.date, windowStart),
        ),
      ),
    db
      .select({
        weekStart: reflections.weekStart,
        promise: reflections.promise,
        promiseGoalId: reflections.promiseGoalId,
        prevOutcome: reflections.prevOutcome,
        ifThenItemId: reflections.ifThenItemId,
      })
      .from(reflections)
      .where(and(eq(reflections.userId, userId), inArray(reflections.weekStart, weekStarts))),
    db
      .select({ goalId: checklistItems.goalId, ifThen: checklistItems.ifThen })
      .from(checklistItems)
      .innerJoin(goals, eq(goals.id, checklistItems.goalId))
      .where(and(isNull(checklistItems.deletedAt), eq(goals.userId, userId), isNull(goals.deletedAt))),
    weekStarts.length === 0 ? Promise.resolve([]) : listPlanAdjustmentsForUser(userId, windowStart),
  ]);

  return {
    checkins: checkinRows,
    reflections: reflectionRows,
    checklistItems: checklistRows,
    planAdjustments: planAdjustmentRows.map((row) => ({ decision: row.decision })),
  };
}
