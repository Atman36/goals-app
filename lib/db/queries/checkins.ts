import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { checkins, goals, type Checkin, type NewCheckin } from "@/lib/db/schema";

/** All non-deleted check-ins for a goal the user owns, oldest first — feeds the
 *  goal-page trajectory's weekly aggregation. Ownership scoped via the goals
 *  join, mirroring getCheckinForGoalOnDate. */
export async function listCheckinsForGoal(
  userId: string,
  goalId: string,
): Promise<{ date: string; outcome: "done" | "partial" | "skipped"; feeling: number }[]> {
  return db
    .select({
      date: checkins.date,
      outcome: checkins.outcome,
      feeling: checkins.feeling,
    })
    .from(checkins)
    .innerJoin(goals, eq(goals.id, checkins.goalId))
    .where(
      and(
        eq(checkins.goalId, goalId),
        isNull(checkins.deletedAt),
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(asc(checkins.date));
}

/** The (non-deleted) check-in for a goal on a given UTC date-key, scoped to
 *  the owning user via goals.userId — mirrors getGoalWithDetails's ownership
 *  join. Returns null when there's no check-in yet, or the goal isn't the
 *  user's (or is deleted). */
export async function getCheckinForGoalOnDate(
  userId: string,
  goalId: string,
  dateKey: string,
): Promise<Checkin | null> {
  const [row] = await db
    .select(getTableColumns(checkins))
    .from(checkins)
    .innerJoin(goals, eq(goals.id, checkins.goalId))
    .where(
      and(
        eq(checkins.goalId, goalId),
        eq(checkins.date, dateKey),
        isNull(checkins.deletedAt),
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Upsert on (goal_id, date) — re-saving the same day updates the existing
 *  row (Decisions: one check-in per goal per UTC day) and clears any prior
 *  soft-delete. Caller (lib/actions/checkins.ts) is responsible for the
 *  owner/active check before calling this.
 *
 *  Note: the update `set.note` uses `?? null` rather than passing
 *  `values.note` through as-is — drizzle's mapUpdateSet drops any `set` key
 *  whose value is `undefined` (utils.js's `filter(([, v]) => v !== void 0)`),
 *  so an `undefined` note (the validator's "empty note" value) would leave a
 *  previously-saved note untouched instead of clearing it. `null` is a real
 *  value and is written as intended. */
export async function upsertCheckinRow(
  userId: string,
  values: NewCheckin,
): Promise<Checkin | null> {
  // GA-015: takes `userId` and locks the goal row rather than trusting a check
  // the action performed in an earlier round trip. The upsert itself is
  // unchanged; what changed is that the goal cannot be soft-deleted between the
  // liveness check and this write. See lib/db/queries/parent-lock.ts.
  const row = await withLockedLiveGoal(userId, values.goalId, async (tx) => {
    const [upserted] = await tx
      .insert(checkins)
      .values(values)
      .onConflictDoUpdate({
        target: [checkins.goalId, checkins.date],
        set: {
          outcome: values.outcome,
          feeling: values.feeling,
          note: values.note ?? null,
          updatedAt: new Date(),
          deletedAt: null,
        },
      })
      .returning();
    return upserted ?? null;
  });
  return row ?? null;
}
