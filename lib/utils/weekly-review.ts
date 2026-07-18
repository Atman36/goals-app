import { daysBetweenKeys, type DateKey } from "@/lib/utils/date-keys";
import type { GoalSphere } from "@/lib/spheres";

export type ReviewBucket = "progressed" | "stalled" | "steady";

/** Per-goal activity summary fed by the query in T3. */
export interface GoalActivity {
  goalId: string;
  title: string;
  lastActivityKey: DateKey | null; // max(last contribution occurredAt, last done step date, last check-in date), null if none
  createdAtKey: DateKey;
  contributionsInWindow: number;   // count within progressedWithinDays
  stepsDoneInWindow: number;       // count within progressedWithinDays
  checkinsInWindow: number;        // count within progressedWithinDays
  sphere: GoalSphere | null;       // life sphere the goal belongs to, null if unassigned
}

export function classifyActivity(params: {
  lastActivityKey: DateKey | null;
  createdAtKey: DateKey;
  todayKey: DateKey;
  progressedWithinDays?: number; // default 7
  stalledAfterDays?: number;     // default 14
}): ReviewBucket {
  const progressedWithinDays = params.progressedWithinDays ?? 7;
  const stalledAfterDays = params.stalledAfterDays ?? 14;
  if (params.lastActivityKey) {
    const sinceActivity = daysBetweenKeys(params.lastActivityKey, params.todayKey);
    if (sinceActivity <= progressedWithinDays) return "progressed";
  }
  const reference = params.lastActivityKey ?? params.createdAtKey;
  const idle = daysBetweenKeys(reference, params.todayKey);
  if (idle >= stalledAfterDays) return "stalled";
  return "steady";
}

/** Group goals into the three buckets, preserving input order. */
export function bucketGoals(
  goals: GoalActivity[],
  todayKey: DateKey,
): Record<ReviewBucket, GoalActivity[]> {
  const out: Record<ReviewBucket, GoalActivity[]> = { progressed: [], stalled: [], steady: [] };
  for (const g of goals) {
    out[classifyActivity({ lastActivityKey: g.lastActivityKey, createdAtKey: g.createdAtKey, todayKey })].push(g);
  }
  return out;
}
