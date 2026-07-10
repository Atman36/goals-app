import type { DateKey } from "@/lib/utils/date-keys";
import { previousWeekKey } from "@/lib/utils/week-keys";

/**
 * Consecutive active weeks ending at the current week.
 *
 * `activeWeeks` is a set of Monday-anchored week-start keys that had activity
 * (a contribution or a closed step). Grace rule: an in-progress current week
 * with no activity yet does NOT reset the streak — counting then starts from
 * the previous week, so the number doesn't drop to 0 every Monday morning.
 * The streak is 0 only when neither the current nor the previous week is active.
 */
export function computeStreakWeeks(activeWeeks: Set<DateKey>, currentWeekStart: DateKey): number {
  let cursor: DateKey;
  if (activeWeeks.has(currentWeekStart)) {
    cursor = currentWeekStart;
  } else {
    const prev = previousWeekKey(currentWeekStart);
    if (!activeWeeks.has(prev)) return 0;
    cursor = prev;
  }

  let count = 0;
  while (activeWeeks.has(cursor)) {
    count += 1;
    cursor = previousWeekKey(cursor);
  }
  return count;
}
