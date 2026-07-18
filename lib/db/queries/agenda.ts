import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  checklistItems,
  checkins,
  contributions,
  goals,
  users,
  goalKindEnum,
  goalStatusEnum,
  checklistItemKindEnum,
} from "@/lib/db/schema";
import { getGoalWithDetails, type GoalWithProgress } from "@/lib/db/queries/goals";
import { toDateKey } from "@/lib/utils/date-keys";
import type { GoalActivity } from "@/lib/utils/weekly-review";

type GoalKind = (typeof goalKindEnum.enumValues)[number];
type GoalStatus = (typeof goalStatusEnum.enumValues)[number];
type ChecklistItemKind = (typeof checklistItemKindEnum.enumValues)[number];

export async function getFocusGoal(userId: string): Promise<GoalWithProgress | null> {
  const [u] = await db
    .select({ focusGoalId: users.focusGoalId })
    .from(users)
    .where(eq(users.id, userId));
  if (!u?.focusGoalId) return null;
  const goal = await getGoalWithDetails(userId, u.focusGoalId);
  if (!goal || goal.status !== "active") return null;
  return goal;
}

export async function getWeeklyReviewData(userId: string): Promise<GoalActivity[]> {
  const activeGoals = await db
    .select({ id: goals.id, title: goals.title, createdAt: goals.createdAt, sphere: goals.sphere })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt), eq(goals.status, "active")));

  if (activeGoals.length === 0) return [];

  const ids = activeGoals.map((g) => g.id);
  const windowStartKey = toDateKey(new Date(Date.now() - 7 * 86_400_000));
  const windowStartTs = new Date(Date.now() - 7 * 86_400_000);

  const contribAgg = await db
    .select({
      goalId: contributions.goalId,
      lastOccurredAt: max(contributions.occurredAt),
      // Embed gte(...) rather than interpolating windowStartKey directly —
      // it routes the parameter through the column's own driver-value
      // encoding (raw `${value}` interpolation skips that; see the doneAt
      // filter below, where a raw Date param made postgres-js throw).
      windowCount: sql<number>`count(*) filter (where ${gte(contributions.occurredAt, windowStartKey)})`.mapWith(
        Number,
      ),
    })
    .from(contributions)
    .where(and(inArray(contributions.goalId, ids), isNull(contributions.deletedAt)))
    .groupBy(contributions.goalId);

  const stepAgg = await db
    .select({
      goalId: checklistItems.goalId,
      lastDoneAt: max(checklistItems.doneAt),
      // gte(...) (not raw interpolation) — postgres-js can't serialize a raw
      // JS Date parameter here; routing it through the timestamptz column's
      // driver-value encoding fixes it (see equivalent note above).
      windowCount: sql<number>`count(*) filter (where ${gte(checklistItems.doneAt, windowStartTs)})`.mapWith(
        Number,
      ),
    })
    .from(checklistItems)
    .where(
      and(
        inArray(checklistItems.goalId, ids),
        isNull(checklistItems.deletedAt),
        eq(checklistItems.isDone, true),
        isNotNull(checklistItems.doneAt),
      ),
    )
    .groupBy(checklistItems.goalId);

  const checkinAgg = await db
    .select({
      goalId: checkins.goalId,
      lastDate: max(checkins.date),
      // gte(...) (not raw interpolation) — same postgres-js trap as the two
      // aggregates above.
      windowCount: sql<number>`count(*) filter (where ${gte(checkins.date, windowStartKey)})`.mapWith(
        Number,
      ),
    })
    .from(checkins)
    .where(and(inArray(checkins.goalId, ids), isNull(checkins.deletedAt)))
    .groupBy(checkins.goalId);

  const contribByGoal = new Map(contribAgg.map((r) => [r.goalId, r]));
  const stepByGoal = new Map(stepAgg.map((r) => [r.goalId, r]));
  const checkinByGoal = new Map(checkinAgg.map((r) => [r.goalId, r]));

  return activeGoals.map((g) => {
    const contrib = contribByGoal.get(g.id);
    const step = stepByGoal.get(g.id);
    const checkin = checkinByGoal.get(g.id);
    // contrib.lastOccurredAt and checkin.lastDate are already "yyyy-MM-dd"
    // strings (date columns) — do NOT re-wrap in toDateKey. step.lastDoneAt
    // is a Date (timestamptz).
    const contribKey = contrib?.lastOccurredAt ?? null;
    const stepKey = step?.lastDoneAt ? toDateKey(step.lastDoneAt) : null;
    const checkinKey = checkin?.lastDate ?? null;
    let lastActivityKey: string | null = null;
    for (const key of [contribKey, stepKey, checkinKey]) {
      if (key && (!lastActivityKey || key > lastActivityKey)) lastActivityKey = key;
    }

    return {
      goalId: g.id,
      title: g.title,
      lastActivityKey,
      createdAtKey: toDateKey(g.createdAt),
      contributionsInWindow: contrib?.windowCount ?? 0,
      stepsDoneInWindow: step?.windowCount ?? 0,
      checkinsInWindow: checkin?.windowCount ?? 0,
      sphere: g.sphere,
    };
  });
}

export interface ChecklistStepDue {
  itemId: string;
  goalId: string;
  goalTitle: string;
  title: string;
  dueDate: string;
  kind: ChecklistItemKind;
}

export async function listOverdueAndUpcomingSteps(
  userId: string,
  soonWithinDays = 7,
): Promise<ChecklistStepDue[]> {
  const upperKey = toDateKey(new Date(Date.now() + soonWithinDays * 86_400_000));

  const rows = await db
    .select({
      itemId: checklistItems.id,
      goalId: checklistItems.goalId,
      goalTitle: goals.title,
      title: checklistItems.title,
      dueDate: checklistItems.dueDate,
      kind: checklistItems.kind,
    })
    .from(checklistItems)
    .innerJoin(goals, eq(goals.id, checklistItems.goalId))
    .where(
      and(
        isNull(checklistItems.deletedAt),
        eq(checklistItems.isDone, false),
        isNotNull(checklistItems.dueDate),
        lte(checklistItems.dueDate, upperKey),
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
        eq(goals.status, "active"),
      ),
    )
    .orderBy(asc(checklistItems.dueDate));

  // dueDate is guaranteed non-null by the isNotNull filter above; the column
  // itself is nullable so Drizzle's inferred type is `string | null`.
  return rows.map((r) => ({ ...r, dueDate: r.dueDate as string }));
}

export interface GoalDeadline {
  goalId: string;
  title: string;
  deadline: string;
  kind: GoalKind;
  status: GoalStatus;
}

export async function listGoalsByDeadline(
  userId: string,
  soonWithinDays = 14,
): Promise<GoalDeadline[]> {
  const upperKey = toDateKey(new Date(Date.now() + soonWithinDays * 86_400_000));

  return db
    .select({
      goalId: goals.id,
      title: goals.title,
      deadline: goals.deadline,
      kind: goals.kind,
      status: goals.status,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        isNull(goals.deletedAt),
        eq(goals.status, "active"),
        lte(goals.deadline, upperKey),
      ),
    )
    .orderBy(asc(goals.deadline));
}
