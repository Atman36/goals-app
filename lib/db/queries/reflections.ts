import { and, count, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, reflections, type NewReflection, type Reflection } from "@/lib/db/schema";
import type { Transaction } from "@/lib/db/queries/parent-lock";

/** A reflection row plus the goal its promise names. `promiseGoal` is `null`
 *  when no goal was linked, or the linked goal is foreign or soft-deleted
 *  (Decisions D5) — the promise text itself is never lost or rewritten, only
 *  the goal reference reads back as absent. Scoped to the same userId as the
 *  reflection so a promiseGoalId could never join in another user's title. */
export type ReflectionWithPromiseGoal = Reflection & {
  promiseGoal: { id: string; title: string } | null;
};

function promiseGoalJoinCondition(userId: string) {
  return and(
    eq(goals.id, reflections.promiseGoalId),
    eq(goals.userId, userId),
    isNull(goals.deletedAt),
  );
}

function toReflectionWithPromiseGoal(row: {
  reflection: Reflection;
  goalId: string | null;
  goalTitle: string | null;
}): ReflectionWithPromiseGoal {
  return {
    ...row.reflection,
    promiseGoal: row.goalId ? { id: row.goalId, title: row.goalTitle ?? "" } : null,
  };
}

/** This week's reflection row for the user, if any — the upsert target for
 *  the current week's form (Decisions: same-week re-save updates). */
export async function getReflectionByWeek(
  userId: string,
  weekStart: string,
): Promise<ReflectionWithPromiseGoal | null> {
  const [row] = await db
    .select({ reflection: reflections, goalId: goals.id, goalTitle: goals.title })
    .from(reflections)
    .leftJoin(goals, promiseGoalJoinCondition(userId))
    .where(and(eq(reflections.userId, userId), eq(reflections.weekStart, weekStart)))
    .limit(1);
  return row ? toReflectionWithPromiseGoal(row) : null;
}

/** The most recent reflection strictly before `weekStart` — carries last
 *  week's promise forward so its outcome can be marked this week (Decisions:
 *  promise cycle). */
export async function getLatestReflectionBefore(
  userId: string,
  weekStart: string,
): Promise<ReflectionWithPromiseGoal | null> {
  const [row] = await db
    .select({ reflection: reflections, goalId: goals.id, goalTitle: goals.title })
    .from(reflections)
    .leftJoin(goals, promiseGoalJoinCondition(userId))
    .where(and(eq(reflections.userId, userId), lt(reflections.weekStart, weekStart)))
    .orderBy(desc(reflections.weekStart))
    .limit(1);
  return row ? toReflectionWithPromiseGoal(row) : null;
}

/** Past reflections, most recent week first — backs the "История" list. */
export async function listReflections(
  userId: string,
  limit = 12,
): Promise<ReflectionWithPromiseGoal[]> {
  const rows = await db
    .select({ reflection: reflections, goalId: goals.id, goalTitle: goals.title })
    .from(reflections)
    .leftJoin(goals, promiseGoalJoinCondition(userId))
    .where(eq(reflections.userId, userId))
    .orderBy(desc(reflections.weekStart))
    .limit(limit);
  return rows.map(toReflectionWithPromiseGoal);
}

/** Upsert on (user_id, week_start) — re-saving the same week updates the
 *  existing row instead of creating a duplicate.
 *
 *  `executor` defaults to the module-level `db` but accepts a transaction
 *  handle so the caller can write inside the same lock it took on the
 *  promise's goal row — the GA-015 idiom (lib/db/queries/parent-lock.ts).
 *  Unlike the other child-write query modules, the decision to lock at all is
 *  the CALLER's (lib/actions/reflections.ts): a promise with no goal never
 *  opens a transaction, so this function cannot open one on its own.
 *
 *  Note: the update `set` fields use `?? null` rather than passing `fields`
 *  through as-is — drizzle's mapUpdateSet drops any `set` key whose value is
 *  `undefined` (utils.js's `filter(([, v]) => v !== void 0)`), so an
 *  `undefined` optional field (the validator's "empty" value) would leave a
 *  previously-saved value untouched instead of clearing it. `null` is a real
 *  value and is written as intended — same fix as upsertCheckinRow in
 *  lib/db/queries/checkins.ts. */
export async function upsertReflection(
  userId: string,
  weekStart: string,
  fields: Omit<NewReflection, "id" | "userId" | "weekStart" | "createdAt">,
  executor: Transaction | typeof db = db,
): Promise<Reflection | null> {
  const [row] = await executor
    .insert(reflections)
    .values({ userId, weekStart, ...fields })
    .onConflictDoUpdate({
      target: [reflections.userId, reflections.weekStart],
      set: {
        promised: fields.promised ?? null,
        done: fields.done ?? null,
        blocked: fields.blocked ?? null,
        learned: fields.learned ?? null,
        promise: fields.promise ?? null,
        prevOutcome: fields.prevOutcome ?? null,
        newIfThen: fields.newIfThen ?? null,
        promiseGoalId: fields.promiseGoalId ?? null,
        ifThenItemId: fields.ifThenItemId ?? null,
      },
    })
    .returning();
  return row ?? null;
}

/** Count of completed promise cycles — reflections whose prevOutcome has
 *  been marked (Decisions: completed-cycle count). */
export async function countCompletedCycles(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(reflections)
    .where(and(eq(reflections.userId, userId), isNotNull(reflections.prevOutcome)));
  return row?.count ?? 0;
}
