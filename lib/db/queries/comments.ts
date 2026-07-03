import { and, asc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, goals, type Comment } from "@/lib/db/schema";

type NewComment = typeof comments.$inferInsert;

export async function listComments(userId: string, goalId: string): Promise<Comment[]> {
  return db
    .select(getTableColumns(comments))
    .from(comments)
    .innerJoin(goals, eq(goals.id, comments.goalId))
    .where(
      and(eq(comments.goalId, goalId), eq(goals.userId, userId), isNull(comments.deletedAt)),
    )
    .orderBy(asc(comments.createdAt));
}

export async function insertComment(
  userId: string,
  values: NewComment,
): Promise<Comment | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db.insert(comments).values(values).returning();
  return row;
}

export async function softDeleteComment(userId: string, commentId: string): Promise<void> {
  await db
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
            .where(and(eq(goals.id, comments.goalId), eq(goals.userId, userId))),
        ),
      ),
    );
}
