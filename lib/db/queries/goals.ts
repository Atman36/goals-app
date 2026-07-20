import { and, asc, count, desc, eq, inArray, isNull, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  checklistItems,
  contributions,
  goals,
  goalKindEnum,
  goalStatusEnum,
  mediaItems,
  woopEntries,
  type Goal,
  type NewGoal,
  type NewWoopEntry,
  type WoopEntry,
} from "@/lib/db/schema";
import { calcFinancialProgress } from "@/lib/utils/money";
import { goalStatusSourcesFor, type Currency } from "@/lib/validators/goal";

type GoalKind = (typeof goalKindEnum.enumValues)[number];
type GoalStatus = (typeof goalStatusEnum.enumValues)[number];

export interface GoalWithProgress extends Goal {
  saved: bigint;
  checklistDone: number;
  checklistTotal: number;
  /** storage_path of the cover media item (coverImageId), null when unset/deleted. */
  coverStoragePath: string | null;
}

export interface ListGoalsOptions {
  status?: GoalStatus;
  kind?: GoalKind;
  currency?: Currency;
  sort?: "deadline" | "percent" | "created";
}

export interface DashboardAggregates {
  byCurrency: Record<Currency, { saved: bigint; target: bigint }>;
  doneItems: number;
  totalItems: number;
}

/** Per-goal SUM of non-deleted contributions, one row per goal. */
function savedSubquery() {
  return db
    .select({
      goalId: contributions.goalId,
      // Aliased uniquely (not "total") — Drizzle emits this derived table's
      // column references unqualified in the outer SELECT, so a name shared
      // with another joined subquery (checklistCountsSubquery's "total")
      // causes a Postgres "column reference is ambiguous" error.
      total: sum(contributions.amount).as("saved_total"),
    })
    .from(contributions)
    .where(isNull(contributions.deletedAt))
    .groupBy(contributions.goalId)
    .as("saved_sq");
}

/** Per-goal checklist done/total counts (non-deleted items), one row per goal. */
function checklistCountsSubquery() {
  return db
    .select({
      goalId: checklistItems.goalId,
      total: count().as("checklist_total"),
      // count(expr) only counts non-null rows, so this yields the "done" count.
      done: count(sql`CASE WHEN ${checklistItems.isDone} THEN 1 END`).as("checklist_done"),
    })
    .from(checklistItems)
    .where(isNull(checklistItems.deletedAt))
    .groupBy(checklistItems.goalId)
    .as("checklist_sq");
}

function toGoalWithProgress(row: {
  goal: Goal;
  saved: string | null;
  checklistDone: number | null;
  checklistTotal: number | null;
  coverStoragePath: string | null;
}): GoalWithProgress {
  return {
    ...row.goal,
    saved: (row.goal.initialAmount ?? 0n) + BigInt(row.saved ?? "0"),
    checklistDone: row.checklistDone ?? 0,
    checklistTotal: row.checklistTotal ?? 0,
    coverStoragePath: row.coverStoragePath,
  };
}

function goalProgress(goal: GoalWithProgress): number {
  if (goal.kind === "financial") {
    return calcFinancialProgress(goal.saved, goal.targetAmount ?? 0n);
  }
  if (goal.checklistTotal > 0) return goal.checklistDone / goal.checklistTotal;
  return (goal.manualProgress ?? 0) / 100;
}

function orderByFor(sort: ListGoalsOptions["sort"]): SQL[] {
  if (sort === "created") return [desc(goals.createdAt)];
  return [asc(goals.deadline)];
}

export async function listGoals(
  userId: string,
  opts: ListGoalsOptions = {},
): Promise<GoalWithProgress[]> {
  const savedSq = savedSubquery();
  const checklistSq = checklistCountsSubquery();

  const conditions = [eq(goals.userId, userId), isNull(goals.deletedAt)];
  if (opts.status) conditions.push(eq(goals.status, opts.status));
  if (opts.kind) conditions.push(eq(goals.kind, opts.kind));
  if (opts.currency) conditions.push(eq(goals.currency, opts.currency));

  const rows = await db
    .select({
      goal: goals,
      saved: savedSq.total,
      checklistDone: checklistSq.done,
      checklistTotal: checklistSq.total,
      coverStoragePath: mediaItems.storagePath,
    })
    .from(goals)
    .leftJoin(savedSq, eq(savedSq.goalId, goals.id))
    .leftJoin(checklistSq, eq(checklistSq.goalId, goals.id))
    .leftJoin(mediaItems, and(eq(mediaItems.id, goals.coverImageId), isNull(mediaItems.deletedAt)))
    .where(and(...conditions))
    .orderBy(...orderByFor(opts.sort));

  const result = rows.map(toGoalWithProgress);
  if (opts.sort === "percent") {
    result.sort((a, b) => goalProgress(b) - goalProgress(a));
  }
  return result;
}

export async function getGoalWithDetails(
  userId: string,
  goalId: string,
): Promise<GoalWithProgress | null> {
  const savedSq = savedSubquery();
  const checklistSq = checklistCountsSubquery();

  const [row] = await db
    .select({
      goal: goals,
      saved: savedSq.total,
      checklistDone: checklistSq.done,
      checklistTotal: checklistSq.total,
      coverStoragePath: mediaItems.storagePath,
    })
    .from(goals)
    .leftJoin(savedSq, eq(savedSq.goalId, goals.id))
    .leftJoin(checklistSq, eq(checklistSq.goalId, goals.id))
    .leftJoin(mediaItems, and(eq(mediaItems.id, goals.coverImageId), isNull(mediaItems.deletedAt)))
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);

  return row ? toGoalWithProgress(row) : null;
}

export async function insertGoal(
  userId: string,
  values: Omit<NewGoal, "userId">,
): Promise<Goal> {
  const [row] = await db
    .insert(goals)
    .values({ ...values, userId })
    .returning();
  return row;
}

/**
 * Creates a goal and its optional WOOP entry atomically. Doing these as two
 * separate statements let a WOOP failure leave a goal with no WOOP row while
 * the action still reported success (CR-019). The WOOP insert needs no
 * ownership pre-check here: the goal is created inside this same transaction
 * and is therefore owned by `userId` by construction.
 */
export async function insertGoalWithWoop(
  userId: string,
  values: Omit<NewGoal, "userId">,
  woopValues: Pick<NewWoopEntry, "wish" | "outcome" | "obstacle" | "plan"> | null,
): Promise<{ goal: Goal; woop: WoopEntry | null }> {
  return db.transaction(async (tx) => {
    const [goal] = await tx
      .insert(goals)
      .values({ ...values, userId })
      .returning();

    if (!woopValues) return { goal, woop: null };

    const [woop] = await tx
      .insert(woopEntries)
      .values({ ...woopValues, goalId: goal.id })
      .returning();

    return { goal, woop: woop ?? null };
  });
}

export async function updateGoal(
  userId: string,
  goalId: string,
  values: Partial<Omit<NewGoal, "id" | "userId">>,
): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes one owned, still-live goal and reports which row it actually
 * changed — `null` when the UPDATE matched nothing (GA-024 / SOFT-DELETE-001).
 *
 * The predicate already excluded a foreign or already-deleted goal, but the
 * void return meant a zero-row write was indistinguishable from a real one, so
 * the action logged and reported success for a delete that did nothing (two
 * tabs deleting the same goal: the second one races and matches no row).
 * Returning the id makes "did this write happen" answerable by the caller
 * rather than assumed — the same shape the checklist/comment deletes use.
 */
export async function softDeleteGoal(userId: string, goalId: string): Promise<string | null> {
  const [row] = await db
    .update(goals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .returning({ id: goals.id });
  return row?.id ?? null;
}

export type SetGoalStatusResult =
  | { ok: true; goal: Goal; changed: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "illegal_transition"; from: GoalStatus };

/**
 * Moves a goal to `status`, but only along a transition the matrix in
 * lib/validators/goal.ts permits (`goalStatusSourcesFor`).
 *
 * Two things this must never do, both of which the previous unconditional
 * UPDATE did:
 *   1. Apply an illegal transition. The expected-status guard lives in the
 *      WHERE clause, so the check and the write are one atomic statement — no
 *      read-then-write window.
 *   2. Clobber `achievedAt`. It is written *only* on a transition into
 *      "achieved"; every other transition omits the key entirely (drizzle drops
 *      undefined-valued keys), so archiving an achieved goal preserves the date
 *      it was achieved instead of nulling it out.
 *
 * A no-op (goal already in `status`) is reported as ok/changed:false and writes
 * nothing — re-marking an achieved goal must not move its achievedAt either.
 */
export async function setGoalStatus(
  userId: string,
  goalId: string,
  status: GoalStatus,
): Promise<SetGoalStatusResult> {
  const scope = and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt));

  const [row] = await db
    .update(goals)
    .set({
      status,
      ...(status === "achieved" ? { achievedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(scope, inArray(goals.status, goalStatusSourcesFor(status))))
    .returning();

  if (row) return { ok: true, goal: row, changed: true };

  // Zero rows matched: the goal is missing/deleted, it is already in the target
  // status, or the transition is illegal. Re-read to tell those apart so the
  // caller can return a precise error rather than a blanket "not found".
  const [existing] = await db.select().from(goals).where(scope).limit(1);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === status) return { ok: true, goal: existing, changed: false };
  return { ok: false, reason: "illegal_transition", from: existing.status };
}

export async function getDashboardAggregates(userId: string): Promise<DashboardAggregates> {
  const savedSq = savedSubquery();

  const financialRows = await db
    .select({
      currency: goals.currency,
      target: sum(goals.targetAmount).as("target"),
      initial: sum(goals.initialAmount).as("initial"),
      contributed: sum(savedSq.total).as("contributed"),
    })
    .from(goals)
    .leftJoin(savedSq, eq(savedSq.goalId, goals.id))
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.kind, "financial"),
        eq(goals.status, "active"),
        isNull(goals.deletedAt),
      ),
    )
    .groupBy(goals.currency);

  const byCurrency: Record<Currency, { saved: bigint; target: bigint }> = {
    RUB: { saved: 0n, target: 0n },
    USD: { saved: 0n, target: 0n },
  };
  for (const row of financialRows) {
    if (!row.currency) continue;
    byCurrency[row.currency] = {
      saved: BigInt(row.initial ?? "0") + BigInt(row.contributed ?? "0"),
      target: BigInt(row.target ?? "0"),
    };
  }

  const [checklistTotals] = await db
    .select({
      totalItems: count().as("totalItems"),
      doneItems: count(sql`CASE WHEN ${checklistItems.isDone} THEN 1 END`).as("doneItems"),
    })
    .from(checklistItems)
    .innerJoin(goals, eq(goals.id, checklistItems.goalId))
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.kind, "non_financial"),
        eq(goals.status, "active"),
        isNull(goals.deletedAt),
        isNull(checklistItems.deletedAt),
      ),
    );

  return {
    byCurrency,
    doneItems: checklistTotals?.doneItems ?? 0,
    totalItems: checklistTotals?.totalItems ?? 0,
  };
}

/**
 * The one readability predicate for a goal: does `goalId` name a live goal the
 * caller may read? Deliberately answers a single boolean and nothing else —
 * a foreign goal, a deleted goal and a goal that never existed are
 * indistinguishable from the outside, so a caller cannot turn it into an
 * existence oracle (GA-026 / DATA-OWNERSHIP-001).
 *
 * Cheaper than getGoalWithDetails (no aggregates, no joins) for callers that
 * only need the capability answer — e.g. goal-scoped analytics.
 */
export async function canReadGoal(userId: string, goalId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  return row !== undefined;
}

export async function hasContributions(userId: string, goalId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contributions.id })
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
    .limit(1);
  return !!row;
}
