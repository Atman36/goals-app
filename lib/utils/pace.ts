const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 30.44; // average Gregorian month length
const DAYS_PER_WEEK = 7;

export type PaceStatus = "on_track" | "behind" | "ahead";

function monthsUntil(deadline: Date, from: Date): number {
  const days = (deadline.getTime() - from.getTime()) / MS_PER_DAY;
  return Math.max(days, 0) / DAYS_PER_MONTH;
}

function weeksUntil(deadline: Date, from: Date): number {
  const days = (deadline.getTime() - from.getTime()) / MS_PER_DAY;
  return Math.max(days, 0) / DAYS_PER_WEEK;
}

/**
 * required_pace = (target_amount − saved) / months_to_deadline — PRD §3.3.4.
 * Returns minor units/month. Null once the deadline has passed (avoid divide-by-near-zero).
 */
export function calcRequiredMonthlyPace(
  targetAmount: bigint,
  saved: bigint,
  deadline: Date,
  from: Date = new Date(),
): bigint | null {
  const months = monthsUntil(deadline, from);
  if (months <= 0) return null;
  const remaining = targetAmount - saved;
  if (remaining <= 0n) return 0n;
  return BigInt(Math.ceil(Number(remaining) / months));
}

/** For non-financial goals: remaining checklist items per week until the deadline — PRD §3.3.4. */
export function calcRequiredWeeklyItemPace(
  remainingItems: number,
  deadline: Date,
  from: Date = new Date(),
): number | null {
  const weeks = weeksUntil(deadline, from);
  if (weeks <= 0) return null;
  if (remainingItems <= 0) return 0;
  return Math.ceil((remainingItems / weeks) * 10) / 10;
}

/** Compares required pace against the actual average pace over the trailing window. */
export function comparePace(requiredPace: number, actualPace: number, tolerance = 0.1): PaceStatus {
  if (actualPace >= requiredPace * (1 + tolerance)) return "ahead";
  if (actualPace < requiredPace * (1 - tolerance)) return "behind";
  return "on_track";
}
