import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
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

/** Atomic goal edit: locks and re-reads the current formulation, records that
 *  exact snapshot when content changed, then applies the update. The row lock
 *  prevents two tabs from both recording the same stale "before" state. */
export async function updateGoalWithRevision(
  userId: string,
  goalId: string,
  goalValues: Partial<Omit<NewGoal, "id" | "userId">> & {
    title: string;
    description: string | null;
    deadline: string;
  },
): Promise<Goal | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        title: goals.title,
        description: goals.description,
        deadline: goals.deadline,
      })
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .for("update");
    if (!current) return null;

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
    return updated ?? null;
  });
}
