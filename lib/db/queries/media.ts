import {
  and,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { comments, goals, mediaItems, type MediaItem } from "@/lib/db/schema";

type NewMediaItem = typeof mediaItems.$inferInsert;

/** True when the media item is attached to a goal, or a comment, owned by userId. */
function ownedByUser(userId: string) {
  return or(
    exists(
      db
        .select({ one: sql`1` })
        .from(goals)
        .where(
          and(eq(goals.id, mediaItems.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(comments)
        .innerJoin(goals, eq(goals.id, comments.goalId))
        .where(
          and(
            eq(comments.id, mediaItems.commentId),
            eq(goals.userId, userId),
            isNull(comments.deletedAt),
            isNull(goals.deletedAt),
          ),
        ),
    ),
  );
}

export async function listMediaByGoal(userId: string, goalId: string): Promise<MediaItem[]> {
  return db
    .select(getTableColumns(mediaItems))
    .from(mediaItems)
    .where(
      and(eq(mediaItems.goalId, goalId), isNull(mediaItems.deletedAt), ownedByUser(userId)),
    )
    .orderBy(desc(mediaItems.createdAt));
}

export async function listAllMedia(
  userId: string,
): Promise<(MediaItem & { goalTitle: string | null })[]> {
  const goalsViaComment = alias(goals, "goals_via_comment");

  const rows = await db
    .select({
      media: getTableColumns(mediaItems),
      directTitle: goals.title,
      commentTitle: goalsViaComment.title,
    })
    .from(mediaItems)
    .leftJoin(goals, eq(goals.id, mediaItems.goalId))
    .leftJoin(comments, eq(comments.id, mediaItems.commentId))
    .leftJoin(goalsViaComment, eq(goalsViaComment.id, comments.goalId))
    .where(
      and(
        isNull(mediaItems.deletedAt),
        ownedByUser(userId),
        // Parent chain must be alive: goal-attached media needs its goal non-deleted;
        // comment-attached media needs the comment AND that comment's goal non-deleted.
        or(
          and(isNotNull(goals.id), isNull(goals.deletedAt)),
          and(
            isNotNull(comments.id),
            isNull(comments.deletedAt),
            isNull(goalsViaComment.deletedAt),
          ),
        ),
      ),
    )
    .orderBy(desc(mediaItems.createdAt));

  return rows.map((r) => ({
    ...r.media,
    goalTitle: r.directTitle ?? r.commentTitle ?? null,
  }));
}

async function canAttachMedia(
  userId: string,
  values: Pick<NewMediaItem, "goalId" | "commentId">,
): Promise<boolean> {
  if (values.goalId) {
    const [goal] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .limit(1);
    return !!goal;
  }
  if (values.commentId) {
    const [row] = await db
      .select({ id: comments.id })
      .from(comments)
      .innerJoin(goals, eq(goals.id, comments.goalId))
      .where(
        and(
          eq(comments.id, values.commentId),
          eq(goals.userId, userId),
          isNull(comments.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }
  return false;
}

export async function insertMediaItem(
  userId: string,
  values: NewMediaItem,
): Promise<MediaItem | null> {
  const allowed = await canAttachMedia(userId, values);
  if (!allowed) return null;

  const [row] = await db.insert(mediaItems).values(values).returning();
  return row;
}

export async function softDeleteMediaItem(userId: string, mediaId: string): Promise<void> {
  await db
    .update(mediaItems)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaItems.id, mediaId), isNull(mediaItems.deletedAt), ownedByUser(userId)));
}

export async function countMediaForGoal(userId: string, goalId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(mediaItems)
    .where(
      and(eq(mediaItems.goalId, goalId), isNull(mediaItems.deletedAt), ownedByUser(userId)),
    );
  return row?.count ?? 0;
}
