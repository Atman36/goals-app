import { and, asc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
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

export async function insertChecklistItem(
  userId: string,
  values: NewChecklistItem,
): Promise<ChecklistItem | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db.insert(checklistItems).values(values).returning();
  return row;
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
