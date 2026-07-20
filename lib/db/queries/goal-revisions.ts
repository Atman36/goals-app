import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contributions,
  goalRevisions,
  goals,
  type Goal,
  type GoalRevision,
  type NewGoal,
} from "@/lib/db/schema";
import { diffGoalContent } from "@/lib/utils/goal-revision";

/** Formulation revisions for a goal the user owns, oldest first — the order the
 *  trajectory builder replays them in. Ownership is proven by an inner join to
 *  goals on goal_id, same convention as listComments. */
export async function listGoalRevisions(userId: string, goalId: string): Promise<GoalRevision[]> {
  return db
    .select({
      id: goalRevisions.id,
      goalId: goalRevisions.goalId,
      title: goalRevisions.title,
      description: goalRevisions.description,
      deadline: goalRevisions.deadline,
      changed: goalRevisions.changed,
      changedAt: goalRevisions.changedAt,
    })
    .from(goalRevisions)
    .innerJoin(goals, eq(goals.id, goalRevisions.goalId))
    .where(
      and(
        eq(goalRevisions.goalId, goalId),
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(asc(goalRevisions.changedAt));
}

/**
 * Outcome of a goal edit. `stale` and `currency_locked` are refusals: nothing
 * was written, no revision was recorded, and the caller must show the reason
 * rather than a generic failure.
 */
export type UpdateGoalOutcome =
  | { status: "updated"; goal: Goal }
  | { status: "not_found" }
  /** Someone else edited the goal after this form was rendered. `current` is
   *  the committed row, so the UI can offer to reload into it. */
  | { status: "stale"; current: Goal }
  | { status: "currency_locked" };

/**
 * Atomic goal edit under the same goal-row lock every child write takes
 * (lib/db/queries/parent-lock.ts), performing three checks the caller cannot
 * safely perform for itself:
 *
 * 1. **GA-012 — stale full-form writes.** The edit form posts a complete
 *    payload, so a tab that loaded before someone else's save would overwrite
 *    fields it never showed the user. The old code locked the row and recorded a
 *    *truthful* prior snapshot, which made the loss auditable but did not
 *    prevent it: the subsequent `.set({...goalValues})` still wrote every stale
 *    field. Comparing `expectedUpdatedAt` against the locked row turns that
 *    silent overwrite into a refusal. The token is compared only — `updatedAt`
 *    is always server-derived, so a forged token cannot set a row's timestamp.
 *
 * 2. **GA-016 — currency lock race.** "Does this goal have contributions?" was
 *    answered in the action, in its own round trip, before this transaction
 *    began. A contribution committing in that window left the goal's first
 *    contribution reinterpreted under a currency chosen after it was validated.
 *    Counting live contributions *inside* this lock serializes the two, because
 *    insertContributionIdempotent contends for the same row.
 *
 * 3. The revision snapshot, which now only happens on a write that actually
 *    proceeds — a refused edit records nothing.
 */
export async function updateGoalWithRevision(
  userId: string,
  goalId: string,
  goalValues: Partial<Omit<NewGoal, "id" | "userId">> & {
    title: string;
    description: string | null;
    deadline: string;
  },
  expectedUpdatedAt: Date,
): Promise<UpdateGoalOutcome> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .for("update");
    if (!current) return { status: "not_found" };

    // Millisecond equality on the timestamp column. Compared as epoch numbers
    // rather than Date identity, and never as strings — the client round-trips
    // the token through JSON, and two encodings of the same instant must not
    // read as a conflict.
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { status: "stale", current };
    }

    if (goalValues.currency !== undefined && goalValues.currency !== current.currency) {
      const [live] = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(and(eq(contributions.goalId, goalId), isNull(contributions.deletedAt)))
        .limit(1);
      if (live) return { status: "currency_locked" };
    }

    const changed = diffGoalContent(current, goalValues);
    if (changed.length > 0) {
      await tx.insert(goalRevisions).values({
        goalId,
        title: current.title,
        description: current.description,
        deadline: current.deadline,
        changed,
      });
    }

    const [updated] = await tx
      .update(goals)
      .set({ ...goalValues, updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .returning();
    return updated ? { status: "updated", goal: updated } : { status: "not_found" };
  });
}
