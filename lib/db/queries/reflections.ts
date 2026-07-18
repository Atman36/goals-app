import { and, count, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { reflections, type NewReflection, type Reflection } from "@/lib/db/schema";

/** This week's reflection row for the user, if any — the upsert target for
 *  the current week's form (Decisions: same-week re-save updates). */
export async function getReflectionByWeek(userId: string, weekStart: string): Promise<Reflection | null> {
  const [row] = await db
    .select()
    .from(reflections)
    .where(and(eq(reflections.userId, userId), eq(reflections.weekStart, weekStart)))
    .limit(1);
  return row ?? null;
}

/** The most recent reflection strictly before `weekStart` — carries last
 *  week's promise forward so its outcome can be marked this week (Decisions:
 *  promise cycle). */
export async function getLatestReflectionBefore(
  userId: string,
  weekStart: string,
): Promise<Reflection | null> {
  const [row] = await db
    .select()
    .from(reflections)
    .where(and(eq(reflections.userId, userId), lt(reflections.weekStart, weekStart)))
    .orderBy(desc(reflections.weekStart))
    .limit(1);
  return row ?? null;
}

/** Past reflections, most recent week first — backs the "История" list. */
export async function listReflections(userId: string, limit = 12): Promise<Reflection[]> {
  return db
    .select()
    .from(reflections)
    .where(eq(reflections.userId, userId))
    .orderBy(desc(reflections.weekStart))
    .limit(limit);
}

/** Upsert on (user_id, week_start) — re-saving the same week updates the
 *  existing row instead of creating a duplicate.
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
): Promise<Reflection | null> {
  const [row] = await db
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
