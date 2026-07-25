import { and, asc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withLockedLiveGoal, type Transaction } from "@/lib/db/queries/parent-lock";
import { checklistItems, goals, type ChecklistItem } from "@/lib/db/schema";

type NewChecklistItem = typeof checklistItems.$inferInsert;

function ownedByUser(userId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(goals)
      .where(
        and(
          eq(goals.id, checklistItems.goalId),
          eq(goals.userId, userId),
          isNull(goals.deletedAt),
        ),
      ),
  );
}

export async function listChecklistItems(
  userId: string,
  goalId: string,
): Promise<ChecklistItem[]> {
  return db
    .select(getTableColumns(checklistItems))
    .from(checklistItems)
    .innerJoin(goals, eq(goals.id, checklistItems.goalId))
    .where(
      and(
        eq(checklistItems.goalId, goalId),
        eq(goals.userId, userId),
        isNull(checklistItems.deletedAt),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}

/** GA-015: the liveness check and the insert share one transaction with the
 *  goal row locked, so a goal soft-deleted mid-flight cannot end up with a new
 *  live item under it. See lib/db/queries/parent-lock.ts. */
export async function insertChecklistItem(
  userId: string,
  values: NewChecklistItem,
): Promise<ChecklistItem | null> {
  const row = await withLockedLiveGoal(userId, values.goalId, async (tx) => {
    const [inserted] = await tx.insert(checklistItems).values(values).returning();
    return inserted ?? null;
  });
  return row ?? null;
}

export async function setChecklistItemDone(
  userId: string,
  itemId: string,
  isDone: boolean,
): Promise<ChecklistItem | null> {
  const [row] = await db
    .update(checklistItems)
    .set({ isDone, doneAt: isDone ? new Date() : null })
    .where(
      and(eq(checklistItems.id, itemId), isNull(checklistItems.deletedAt), ownedByUser(userId)),
    )
    .returning();
  return row ?? null;
}

export async function updateChecklistItem(
  userId: string,
  itemId: string,
  values: Partial<Omit<NewChecklistItem, "id" | "goalId">>,
): Promise<ChecklistItem | null> {
  const [row] = await db
    .update(checklistItems)
    .set(values)
    .where(
      and(eq(checklistItems.id, itemId), isNull(checklistItems.deletedAt), ownedByUser(userId)),
    )
    .returning();
  return row ?? null;
}

/**
 * Returns the soft-deleted row, or null when nothing matched — i.e. the item
 * does not exist, is already deleted, or belongs to another user. Callers must
 * branch on the result rather than assuming success (CR-026); the three cases
 * are deliberately indistinguishable so a miss cannot be used to probe for the
 * existence of another user's item.
 */
export async function softDeleteChecklistItem(
  userId: string,
  itemId: string,
): Promise<ChecklistItem | null> {
  const [row] = await db
    .update(checklistItems)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(checklistItems.id, itemId), isNull(checklistItems.deletedAt), ownedByUser(userId)),
    )
    .returning();
  return row ?? null;
}

// --- Writes for a caller that already holds the goal lock ------------------
// T5 (reflections' if-then step): lib/actions/reflections.ts opens its own
// withLockedLiveGoal and must do the checklist-item write in that SAME
// transaction, not a second one — insertChecklistItem above always opens its
// own lock, which would be a second lock on the same goal in one transaction
// (unnecessary at best, a deadlock risk if it were ever a different goal).
// These accept the caller's `tx` directly instead. Scope stays inside each
// query: goalId + deletedAt IS NULL, same as the rest of this module.

/** Inserts under the caller's transaction. No lock, no ownership check — the
 *  caller already proved liveness and ownership of `values.goalId` by getting
 *  a `tx` in the first place (withLockedLiveGoal's contract). */
export async function insertChecklistItemTx(
  tx: Transaction,
  values: NewChecklistItem,
): Promise<ChecklistItem> {
  const [inserted] = await tx.insert(checklistItems).values(values).returning();
  if (!inserted) throw new Error("insertChecklistItemTx: insert returned no row");
  return inserted;
}

export async function updateChecklistItemTx(
  tx: Transaction,
  goalId: string,
  itemId: string,
  values: Partial<Pick<NewChecklistItem, "title" | "note" | "dueDate" | "ifThen">>,
): Promise<ChecklistItem | null> {
  const [row] = await tx
    .update(checklistItems)
    .set(values)
    .where(
      and(
        eq(checklistItems.id, itemId),
        eq(checklistItems.goalId, goalId),
        isNull(checklistItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function softDeleteChecklistItemTx(
  tx: Transaction,
  goalId: string,
  itemId: string,
): Promise<ChecklistItem | null> {
  const [row] = await tx
    .update(checklistItems)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(checklistItems.id, itemId),
        eq(checklistItems.goalId, goalId),
        isNull(checklistItems.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
