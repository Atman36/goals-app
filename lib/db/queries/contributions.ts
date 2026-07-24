import { and, desc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
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
  | { status: "conflict"; existing: Contribution | null }
  /**
   * The goal's currency is no longer the one the caller priced this amount in.
   * `currency` is the value the goal actually carries now, so the caller can say
   * which currency the amount would have been recorded under.
   */
  | { status: "currency_changed"; currency: "RUB" | "USD" | null };

/**
 * Inserts a contribution idempotently on its client-generated id (PRD §3.3.1/§7).
 * On conflict it reads the row that already holds the key back in user scope so the
 * caller can decide between an exact replay and a reused-key conflict — an
 * ON CONFLICT DO NOTHING alone cannot distinguish the two (CR-014).
 *
 * `expectedCurrency` is the currency the caller read when it priced this amount.
 * Pass it always; it is what makes the currency lock symmetric (see below).
 */
export async function insertContributionIdempotent(
  userId: string,
  values: NewContribution,
  options: { expectedCurrency?: "RUB" | "USD" | null } = {},
): Promise<InsertContributionResult> {
  // GA-015/GA-016: the parent check and the insert run in one transaction with
  // the goal row locked. That closes two races at once — a goal soft-deleted
  // between check and insert, and a currency edit that observed "no
  // contributions yet" while this insert was in flight (updateGoalWithRevision
  // contends for the same lock). See lib/db/queries/parent-lock.ts.
  //
  // The lock alone only closed the edit's side of that race. This side needs the
  // comparison below: the caller read the goal's currency BEFORE the lock (the
  // route must, to reject non-financial goals and to price the amount), and a
  // currency edit can commit in the gap while contributions are still zero — so
  // both the action check and the database trigger legitimately allow it. The
  // insert then lands under the NEW currency, and 10 000 ₽ becomes $100.00
  // permanently, because the currency is immutable from the first contribution on.
  // Re-reading the locked row and comparing is the only place that can catch it.
  //
  // The result is wrapped so that `null` from the helper means exactly one
  // thing — the goal is not live/owned. An unwrapped `row ?? null` would
  // collide with the idempotent-conflict case, which is not a parent failure.
  const { expectedCurrency } = options;

  const result = await withLockedLiveGoal(userId, values.goalId, async (tx, goal) => {
    if (expectedCurrency !== undefined && goal.currency !== expectedCurrency) {
      // A retry of a contribution that already committed consumes nothing and
      // must stay idempotent even after a currency change, so only a genuinely
      // new row is refused here.
      const [already] = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(eq(contributions.id, values.id))
        .limit(1);
      if (!already) return { currencyChanged: true as const, row: null };
    }

    const [row] = await tx
      .insert(contributions)
      .values(values)
      .onConflictDoNothing({ target: contributions.id })
      .returning();
    return { currencyChanged: false as const, row: row ?? null };
  });

  if (result === null) return { status: "goal_not_found" };
  if (result.currencyChanged) {
    const [current] = await db
      .select({ currency: goals.currency })
      .from(goals)
      .where(and(eq(goals.id, values.goalId), eq(goals.userId, userId)))
      .limit(1);
    return { status: "currency_changed", currency: current?.currency ?? null };
  }
  if (result.row) return { status: "created", contribution: result.row };

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
