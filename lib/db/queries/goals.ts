import { and, asc, count, desc, eq, isNull, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  checklistItems,
  contributions,
  goals,
  goalKindEnum,
  goalStatusEnum,
  type Goal,
  type NewGoal,
} from "@/lib/db/schema";
import { calcFinancialProgress } from "@/lib/utils/money";
import type { Currency } from "@/lib/validators/goal";

type GoalKind = (typeof goalKindEnum.enumValues)[number];
type GoalStatus = (typeof goalStatusEnum.enumValues)[number];

export interface GoalWithProgress extends Goal {
  saved: bigint;
  checklistDone: number;
  checklistTotal: number;
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
      total: sum(contributions.amount).as("total"),
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
      total: count().as("total"),
      // count(expr) only counts non-null rows, so this yields the "done" count.
      done: count(sql`CASE WHEN ${checklistItems.isDone} THEN 1 END`).as("done"),
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
}): GoalWithProgress {
  return {
    ...row.goal,
    saved: (row.goal.initialAmount ?? 0n) + BigInt(row.saved ?? "0"),
    checklistDone: row.checklistDone ?? 0,
    checklistTotal: row.checklistTotal ?? 0,
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
    })
    .from(goals)
    .leftJoin(savedSq, eq(savedSq.goalId, goals.id))
    .leftJoin(checklistSq, eq(checklistSq.goalId, goals.id))
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
    })
    .from(goals)
    .leftJoin(savedSq, eq(savedSq.goalId, goals.id))
    .leftJoin(checklistSq, eq(checklistSq.goalId, goals.id))
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

export async function softDeleteGoal(userId: string, goalId: string): Promise<void> {
  await db
    .update(goals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)));
}

export async function setGoalStatus(
  userId: string,
  goalId: string,
  status: GoalStatus,
): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set({
      status,
      achievedAt: status === "achieved" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .returning();
  return row ?? null;
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
      ),
    )
    .limit(1);
  return !!row;
}
