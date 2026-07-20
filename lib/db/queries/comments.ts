import { and, asc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { comments, goals, type Comment } from "@/lib/db/schema";

type NewComment = typeof comments.$inferInsert;

export async function listComments(userId: string, goalId: string): Promise<Comment[]> {
  return db
    .select(getTableColumns(comments))
    .from(comments)
    .innerJoin(goals, eq(goals.id, comments.goalId))
    .where(
      and(
        eq(comments.goalId, goalId),
        eq(goals.userId, userId),
        isNull(comments.deletedAt),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
}

/** GA-015: liveness check and insert in one transaction under the goal row
 *  lock — see lib/db/queries/parent-lock.ts. */
export async function insertComment(
  userId: string,
  values: NewComment,
): Promise<Comment | null> {
  const row = await withLockedLiveGoal(userId, values.goalId, async (tx) => {
    const [inserted] = await tx.insert(comments).values(values).returning();
    return inserted ?? null;
  });
  return row ?? null;
}

/**
 * Returns the soft-deleted row's id, or null when nothing matched (unknown id,
 * already deleted, or not owned by userId). The caller must not report success
 * on null — the UPDATE is the ownership check, so a silent no-op is exactly the
 * case a truthful action has to surface (CR-033).
 */
export async function softDeleteComment(
  userId: string,
  commentId: string,
): Promise<{ id: string } | null> {
  const [deleted] = await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(comments.id, commentId),
        isNull(comments.deletedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(goals)
            .where(
              and(
                eq(goals.id, comments.goalId),
                eq(goals.userId, userId),
                isNull(goals.deletedAt),
              ),
            ),
        ),
      ),
    )
    .returning({ id: comments.id });

  return deleted ?? null;
}
