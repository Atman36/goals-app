import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, goals } from "@/lib/db/schema";

/**
 * GA-015 — one lock protocol for every write that hangs off a goal.
 *
 * The old shape was: read the goal in one statement, confirm it is live and
 * owned, then INSERT the child in a second statement. Nothing holds between the
 * two, so a goal soft-deleted in the gap still satisfies the foreign key and the
 * child commits *under a deleted parent*. Two browser tabs (or a retry) are
 * enough to hit it — no second user required.
 *
 * The rule here: **the goal row is always the serialization point.** Every child
 * write takes `FOR UPDATE` on `goals` first and does its own INSERT/UPDATE in
 * the same transaction. Because comment-attached media locks the comment's goal
 * rather than the comment, every path in the app takes the same single lock on
 * the same table, so no two of them can deadlock against each other.
 *
 * This also serializes contribution inserts against currency edits (GA-016):
 * `updateGoalWithRevision` takes the same lock, so "goal has no contributions
 * yet" can no longer be observed by an edit that a pending insert is about to
 * falsify.
 */

/** The drizzle transaction handle, inferred rather than imported so it stays
 *  correct if the driver changes. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The locked parent, exposing only what callers legitimately branch on.
 *  `currency` is here because the contribution path must read it under the
 *  same lock that the currency edit contends for. */
export type LockedGoal = {
  id: string;
  status: "active" | "achieved" | "archived";
  currency: "RUB" | "USD" | null;
};

/**
 * Runs `work` with the goal row locked `FOR UPDATE`, but only if that goal is
 * live and owned by `userId`. Returns `null` — without running `work` — when it
 * is not, which every caller already treats as its not-found result.
 *
 * `work` must do all of its writing through the `tx` handle it is given. Using
 * the module-level `db` inside it would issue statements on a different
 * connection, outside the transaction, and silently reintroduce the gap this
 * helper exists to close.
 */
export async function withLockedLiveGoal<T>(
  userId: string,
  goalId: string,
  work: (tx: Transaction, goal: LockedGoal) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const [goal] = await tx
      .select({ id: goals.id, status: goals.status, currency: goals.currency })
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .for("update");
    if (!goal) return null;
    return work(tx, goal);
  });
}

/**
 * Same protocol for a comment-attached write: verifies the comment is live and
 * owned, but takes the lock on the **goal** row (`FOR UPDATE OF goals`) so this
 * path shares the single lock order described above. Returns `null` when the
 * comment is missing, deleted, foreign, or its goal is deleted.
 */
export async function withLockedLiveComment<T>(
  userId: string,
  commentId: string,
  work: (tx: Transaction, comment: { id: string; goalId: string }) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: comments.id, goalId: comments.goalId })
      .from(comments)
      .innerJoin(goals, eq(goals.id, comments.goalId))
      .where(
        and(
          eq(comments.id, commentId),
          eq(goals.userId, userId),
          isNull(comments.deletedAt),
          isNull(goals.deletedAt),
        ),
      )
      .for("update", { of: goals });
    if (!row) return null;
    return work(tx, row);
  });
}
