import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, woopEntries, type NewWoopEntry, type WoopEntry } from "@/lib/db/schema";

export async function insertWoopEntry(
  userId: string,
  goalId: string,
  values: Pick<NewWoopEntry, "wish" | "outcome" | "obstacle" | "plan">,
): Promise<WoopEntry | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db
    .insert(woopEntries)
    .values({ ...values, goalId })
    .returning();
  return row;
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

export async function updateWoopEntry(
  userId: string,
  goalId: string,
  values: Pick<NewWoopEntry, "wish" | "outcome" | "obstacle" | "plan">,
): Promise<WoopEntry | null> {
  const existing = await getWoopByGoal(userId, goalId);
  if (!existing) return null;

  const [row] = await db
    .update(woopEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(woopEntries.id, existing.id))
    .returning();
  return row ?? null;
}

export async function touchWoopLived(userId: string, goalId: string): Promise<WoopEntry | null> {
  const existing = await getWoopByGoal(userId, goalId);
  if (!existing) return null;

  const [row] = await db
    .update(woopEntries)
    .set({ lastLivedAt: new Date(), updatedAt: new Date() })
    .where(eq(woopEntries.id, existing.id))
    .returning();
  return row ?? null;
}
