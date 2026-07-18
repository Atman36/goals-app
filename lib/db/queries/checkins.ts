import { and, eq, getTableColumns, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkins, goals, type Checkin, type NewCheckin } from "@/lib/db/schema";

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
export async function upsertCheckinRow(values: NewCheckin): Promise<Checkin | null> {
  const [row] = await db
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
  return row ?? null;
}
