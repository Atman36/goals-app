import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  goalRevisions,
  goals,
  type Goal,
  type GoalRevision,
  type NewGoal,
  type NewGoalRevision,
} from "@/lib/db/schema";

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

/** Atomic content edit: records the prior snapshot as a revision AND applies the
 *  new values to the goal inside one transaction, so the goal never changes
 *  without its revision (Decision 3). Mirrors the query-layer updateGoal's
 *  ownership scoping; returns null (rolling back the insert) when the goal isn't
 *  the user's / is deleted. Called only when diffGoalContent found a change. */
export async function insertRevisionAndUpdateGoal(
  userId: string,
  goalId: string,
  revision: NewGoalRevision,
  goalValues: Partial<Omit<NewGoal, "id" | "userId">>,
): Promise<Goal | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(goals)
      .set({ ...goalValues, updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .returning();
    if (!updated) return null;

    await tx.insert(goalRevisions).values(revision);
    return updated;
  });
}
