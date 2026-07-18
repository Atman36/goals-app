import { GOAL_SPHERES, SPHERE_LABELS, type GoalSphere } from "@/lib/spheres";
import type { GoalActivity } from "@/lib/utils/weekly-review";

/** Per-sphere slice of the weekly-review balance wheel. */
export interface SphereSlice {
  sphere: GoalSphere;
  label: string;
  activeGoals: number;
  weekEvents: number;
}

export interface BalanceWheelData {
  slices: SphereSlice[];
  unassignedGoals: number;
  maxWeekEvents: number;
}

/** Data-derived, no manual weekly self-scoring (Stage0-4 decision 4). Pure —
 *  slices always cover all 8 spheres in GOAL_SPHERES order, even when a
 *  sphere has no goals this week. */
export function buildBalanceWheel(
  goals: Pick<
    GoalActivity,
    "sphere" | "contributionsInWindow" | "stepsDoneInWindow" | "checkinsInWindow"
  >[],
): BalanceWheelData {
  const bySphere = new Map<GoalSphere, { activeGoals: number; weekEvents: number }>();
  for (const sphere of GOAL_SPHERES) bySphere.set(sphere, { activeGoals: 0, weekEvents: 0 });

  let unassignedGoals = 0;
  for (const goal of goals) {
    if (!goal.sphere) {
      unassignedGoals += 1;
      continue;
    }
    const bucket = bySphere.get(goal.sphere)!;
    bucket.activeGoals += 1;
    bucket.weekEvents +=
      goal.contributionsInWindow + goal.stepsDoneInWindow + goal.checkinsInWindow;
  }

  const slices: SphereSlice[] = GOAL_SPHERES.map((sphere) => ({
    sphere,
    label: SPHERE_LABELS[sphere],
    ...bySphere.get(sphere)!,
  }));

  const maxWeekEvents = Math.max(0, ...slices.map((s) => s.weekEvents));

  return { slices, unassignedGoals, maxWeekEvents };
}
