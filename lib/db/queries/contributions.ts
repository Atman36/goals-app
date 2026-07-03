import { and, desc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contributions, goals, type Contribution, type NewContribution } from "@/lib/db/schema";

export async function listContributions(
  userId: string,
  goalId: string,
): Promise<Contribution[]> {
  return db
    .select(getTableColumns(contributions))
    .from(contributions)
    .innerJoin(goals, eq(goals.id, contributions.goalId))
    .where(
      and(
        eq(contributions.goalId, goalId),
        eq(goals.userId, userId),
        isNull(contributions.deletedAt),
      ),
    )
    .orderBy(desc(contributions.occurredAt), desc(contributions.createdAt));
}

/**
 * Inserts a contribution idempotently on its client-generated id. Returns null when the
 * goal isn't owned by userId (or is deleted), or when a row with this id already exists.
 */
export async function insertContributionIdempotent(
  userId: string,
  values: NewContribution,
): Promise<Contribution | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db
    .insert(contributions)
    .values(values)
    .onConflictDoNothing({ target: contributions.id })
    .returning();
  return row ?? null;
}

export async function softDeleteContribution(
  userId: string,
  contributionId: string,
): Promise<void> {
  await db
    .update(contributions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(contributions.id, contributionId),
        isNull(contributions.deletedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(goals)
            .where(and(eq(goals.id, contributions.goalId), eq(goals.userId, userId))),
        ),
      ),
    );
}
