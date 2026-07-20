import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, woopEntries, type NewWoopEntry, type WoopEntry } from "@/lib/db/schema";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";

/** Whether the save created the goal's first WOOP entry or edited the existing
 *  one — the action needs the distinction for its one-time `woop_completed`
 *  analytics event, and it can only be answered truthfully by whoever holds the
 *  lock. */
export type SaveWoopResult = { status: "created" | "updated"; entry: WoopEntry };

/**
 * GA-017 + GA-015: read-or-create the goal's single WOOP entry atomically.
 *
 * The action used to ask "does a WOOP exist?" and then insert or update in a
 * separate round trip. Two tabs both answered "no" and both inserted, and since
 * `woop_entries.goal_id` carries no UNIQUE constraint both rows survived —
 * afterwards reads pick the newest by `createdAt` and the other row's content is
 * silently unreachable.
 *
 * Deciding *and* writing under the goal row lock makes the second tab observe
 * the first tab's committed row and update it instead. The database-level
 * backstop is drizzle/0009_woop_one_row_per_goal.sql, which is authored but not
 * yet applied — this function must therefore stand on its own, so it also
 * repairs any pre-existing duplicate by updating the newest row rather than
 * assuming uniqueness.
 */
export async function saveWoopEntry(
  userId: string,
  goalId: string,
  values: Pick<NewWoopEntry, "wish" | "outcome" | "obstacle" | "plan">,
): Promise<SaveWoopResult | null> {
  return withLockedLiveGoal(userId, goalId, async (tx) => {
    const [existing] = await tx
      .select({ id: woopEntries.id })
      .from(woopEntries)
      .where(eq(woopEntries.goalId, goalId))
      .orderBy(desc(woopEntries.createdAt))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(woopEntries)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(woopEntries.id, existing.id))
        .returning();
      return updated ? { status: "updated" as const, entry: updated } : null;
    }

    const [inserted] = await tx
      .insert(woopEntries)
      .values({ ...values, goalId })
      .returning();
    return inserted ? { status: "created" as const, entry: inserted } : null;
  });
}

// T12: goal page read/edit + "прожить образ" support. No deletedAt on this
// table (per lib/db/schema.ts) — ownership is scoped through the parent goal,
// same as insertWoopEntry above.

/** Latest WOOP entry for a goal (there should only ever be one — Decision 1
 *  in T12's spec, one entry per goal, upsert on save — but `createdAt desc`
 *  guards against any pre-T12 duplicate). Null if the goal doesn't exist/isn't
 *  owned by userId, or it has no WOOP yet. */
export async function getWoopByGoal(userId: string, goalId: string): Promise<WoopEntry | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db
    .select()
    .from(woopEntries)
    .where(eq(woopEntries.goalId, goalId))
    .orderBy(desc(woopEntries.createdAt))
    .limit(1);
  return row ?? null;
}

export async function touchWoopLived(userId: string, goalId: string): Promise<WoopEntry | null> {
  const row = await withLockedLiveGoal(userId, goalId, async (tx) => {
    const [existing] = await tx
      .select({ id: woopEntries.id })
      .from(woopEntries)
      .where(eq(woopEntries.goalId, goalId))
      .orderBy(desc(woopEntries.createdAt))
      .limit(1);
    if (!existing) return null;

    const [updated] = await tx
      .update(woopEntries)
      .set({ lastLivedAt: new Date(), updatedAt: new Date() })
      .where(eq(woopEntries.id, existing.id))
      .returning();
    return updated ?? null;
  });
  return row ?? null;
}
