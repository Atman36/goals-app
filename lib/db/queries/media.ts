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
import {
  withLockedLiveComment,
  withLockedLiveGoal,
  type Transaction,
} from "@/lib/db/queries/parent-lock";

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

/**
 * GA-015: runs `work` with this media item's parent locked — the goal row for a
 * goal-attached item, and (via withLockedLiveComment) the comment's goal row for
 * a comment-attached one, so both share one lock order. Returns `null` when the
 * parent is missing, foreign or deleted, which the caller reports as forbidden.
 *
 * This replaces the old `canAttachMedia` boolean: a check whose answer is stale
 * the instant it returns cannot protect the insert that follows it.
 */
async function withLockedMediaParent<T>(
  userId: string,
  values: Pick<NewMediaItem, "goalId" | "commentId">,
  work: (tx: Transaction) => Promise<T>,
): Promise<T | null> {
  if (values.goalId) {
    return withLockedLiveGoal(userId, values.goalId, (tx) => work(tx));
  }
  if (values.commentId) {
    return withLockedLiveComment(userId, values.commentId, (tx) => work(tx));
  }
  return null;
}

/**
 * Outcome of insertMediaItem. `duplicate` means the exact storage path was
 * already registered as a live row owned by this user — the insert is
 * idempotent (the same uploaded object must never yield two gallery rows,
 * CR-009), so the caller gets the pre-existing row instead of an error.
 * `conflict` means the path is taken but the row is not usable by this caller
 * (foreign or soft-deleted), which is a real failure and must be reported.
 */
export type InsertMediaResult =
  | { status: "inserted"; item: MediaItem }
  | { status: "duplicate"; item: MediaItem }
  | { status: "conflict" }
  | { status: "forbidden" };

export async function insertMediaItem(
  userId: string,
  values: NewMediaItem,
): Promise<InsertMediaResult> {
  // No conflict target: the partial unique index on storage_path
  // (drizzle/0007_media_storage_path_unique.sql — confirmed applied by the
  // 2026-07-20 probe run, section A07) covers live rows only, and a target-less
  // ON CONFLICT DO NOTHING arbitrates over every unique index, including
  // partial ones.
  const result = await withLockedMediaParent(userId, values, async (tx) => {
    const [row] = await tx.insert(mediaItems).values(values).onConflictDoNothing().returning();
    return { row: row ?? null };
  });

  if (result === null) return { status: "forbidden" };
  if (result.row) return { status: "inserted", item: result.row };

  const [existing] = await db
    .select(getTableColumns(mediaItems))
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.storagePath, values.storagePath),
        isNull(mediaItems.deletedAt),
        ownedByUser(userId),
      ),
    )
    .limit(1);

  return existing ? { status: "duplicate", item: existing } : { status: "conflict" };
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

/** Sets a goal cover only when the selected media row is alive and attached to
 *  that same goal. The single UPDATE keeps the ownership and association check
 *  atomic, so a caller cannot point a goal at another user's media UUID. */
export async function setGoalCoverForUser(
  userId: string,
  goalId: string,
  mediaId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(goals)
    .set({ coverImageId: mediaId, updatedAt: new Date() })
    .where(
      and(
        eq(goals.id, goalId),
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(mediaItems)
            .where(
              and(
                eq(mediaItems.id, mediaId),
                eq(mediaItems.goalId, goalId),
                isNull(mediaItems.deletedAt),
              ),
            ),
        ),
      ),
    )
    .returning({ id: goals.id });
  return updated !== undefined;
}
