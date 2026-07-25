import { and, desc, eq, getTableColumns, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Transaction } from "@/lib/db/queries/parent-lock";
import { goals, planAdjustments, type NewPlanAdjustment, type PlanAdjustment } from "@/lib/db/schema";

/**
 * Inserts a plan-adjustment row inside the caller's transaction (the same
 * withLockedLiveGoal lock the checklist write happens under — GA-015). Idempotent
 * on (goalId, source, sourceDate) among live rows (Decisions D4): a resubmit
 * conflicts and returns `null` rather than duplicating the record, and the
 * caller must not apply the checklist edit when that happens.
 *
 * The `where` predicate is required because the backing index
 * (plan_adjustments_goal_source_date_uniq, drizzle/0014) is partial — without
 * it Postgres cannot match this insert's ON CONFLICT target to that
 * constraint. Note this is `where`, not `targetWhere`: this installed
 * drizzle-orm version's `onConflictDoNothing` config only reads
 * `{ target, where }` (`onConflictDoUpdate`'s config is the one with
 * `targetWhere` — see node_modules/drizzle-orm/pg-core/query-builders/
 * insert.js); passing `targetWhere` here compiles to no predicate at all,
 * which Postgres rejects for a partial-index arbiter.
 */
export async function insertPlanAdjustmentTx(
  tx: Transaction,
  values: NewPlanAdjustment,
): Promise<PlanAdjustment | null> {
  const [row] = await tx
    .insert(planAdjustments)
    .values(values)
    .onConflictDoNothing({
      target: [planAdjustments.goalId, planAdjustments.source, planAdjustments.sourceDate],
      where: isNull(planAdjustments.deletedAt),
    })
    .returning();
  return row ?? null;
}

/** The most recent live plan-adjustment for a goal, in user scope — backs the
 *  72-hour prompt cooldown (T13's loader) and the "just chose X" note. */
export async function getRecentPlanAdjustmentForGoal(
  userId: string,
  goalId: string,
): Promise<PlanAdjustment | null> {
  const [row] = await db
    .select(getTableColumns(planAdjustments))
    .from(planAdjustments)
    .innerJoin(goals, eq(goals.id, planAdjustments.goalId))
    .where(
      and(
        eq(planAdjustments.goalId, goalId),
        eq(goals.userId, userId),
        isNull(planAdjustments.deletedAt),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(desc(planAdjustments.createdAt))
    .limit(1);
  return row ?? null;
}

/** All live plan-adjustments for a user from `sinceDate` on — backs the T15
 *  metric across all of the user's goals. */
export async function listPlanAdjustmentsForUser(
  userId: string,
  sinceDate: string,
): Promise<PlanAdjustment[]> {
  return db
    .select(getTableColumns(planAdjustments))
    .from(planAdjustments)
    .innerJoin(goals, eq(goals.id, planAdjustments.goalId))
    .where(
      and(
        eq(goals.userId, userId),
        gte(planAdjustments.sourceDate, sinceDate),
        isNull(planAdjustments.deletedAt),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(desc(planAdjustments.createdAt));
}
