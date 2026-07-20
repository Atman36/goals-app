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
        isNull(goals.deletedAt),
      ),
    )
    .orderBy(desc(contributions.occurredAt), desc(contributions.createdAt));
}

/**
 * Reads one contribution by its (client-generated) id in user scope. Deliberately NOT
 * filtered by goalId: an idempotency-key replay may name a different goal than the row
 * that already owns the key, and detecting that mismatch is the whole point (CR-014).
 */
export async function findContributionForUser(
  userId: string,
  contributionId: string,
): Promise<Contribution | null> {
  const [row] = await db
    .select(getTableColumns(contributions))
    .from(contributions)
    .innerJoin(goals, eq(goals.id, contributions.goalId))
    .where(
      and(
        eq(contributions.id, contributionId),
        eq(goals.userId, userId),
        isNull(contributions.deletedAt),
        isNull(goals.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The fields that make two writes under the same idempotency key "the same request".
 * Money stays bigint; `occurredAt` is normalized to a YYYY-MM-DD day string because the
 * column is a DATE (drizzle string mode) while callers may hold a Date. createdAt/
 * deletedAt are excluded — they are server-assigned, not part of the client's intent.
 */
export interface ContributionPayload {
  goalId: string;
  amount: bigint;
  note: string | null;
  occurredAt: string;
}

interface ContributionPayloadLike {
  goalId: string;
  amount: bigint | number | string;
  note?: string | null;
  occurredAt: string | Date;
}

export function canonicalContributionPayload(row: ContributionPayloadLike): ContributionPayload {
  return {
    goalId: row.goalId,
    amount: BigInt(row.amount),
    note: row.note ?? null,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt.toISOString().slice(0, 10)
        : row.occurredAt.slice(0, 10),
  };
}

/** True when a replayed idempotency key carries byte-identical intent to the stored row. */
export function contributionPayloadsMatch(
  a: ContributionPayloadLike,
  b: ContributionPayloadLike,
): boolean {
  const left = canonicalContributionPayload(a);
  const right = canonicalContributionPayload(b);
  return (
    left.goalId === right.goalId &&
    left.amount === right.amount &&
    left.note === right.note &&
    left.occurredAt === right.occurredAt
  );
}

export type InsertContributionResult =
  /** goalId isn't owned by userId, or is soft-deleted. */
  | { status: "goal_not_found" }
  /** The row was written by this call. */
  | { status: "created"; contribution: Contribution }
  /**
   * The id was already taken. `existing` is the row as visible in user scope, or null
   * when the key belongs to something this user may not see (another user's row, a
   * deleted goal, a soft-deleted contribution) — the caller must treat null as a
   * conflict, never as a replay, so nothing leaks across owners.
   */
  | { status: "conflict"; existing: Contribution | null };

/**
 * Inserts a contribution idempotently on its client-generated id (PRD §3.3.1/§7).
 * On conflict it reads the row that already holds the key back in user scope so the
 * caller can decide between an exact replay and a reused-key conflict — an
 * ON CONFLICT DO NOTHING alone cannot distinguish the two (CR-014).
 */
export async function insertContributionIdempotent(
  userId: string,
  values: NewContribution,
): Promise<InsertContributionResult> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return { status: "goal_not_found" };

  const [row] = await db
    .insert(contributions)
    .values(values)
    .onConflictDoNothing({ target: contributions.id })
    .returning();

  if (row) return { status: "created", contribution: row };

  return { status: "conflict", existing: await findContributionForUser(userId, values.id) };
}

export async function softDeleteContribution(
  userId: string,
  goalId: string,
  contributionId: string,
): Promise<Contribution | null> {
  const [row] = await db
    .update(contributions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(contributions.id, contributionId),
        eq(contributions.goalId, goalId),
        isNull(contributions.deletedAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(goals)
            .where(
              and(
                eq(goals.id, contributions.goalId),
                eq(goals.userId, userId),
                isNull(goals.deletedAt),
              ),
            ),
        ),
      ),
    )
    .returning();
  return row ?? null;
}
