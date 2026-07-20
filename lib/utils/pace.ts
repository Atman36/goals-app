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

/** Ticks per month used to carry the (necessarily fractional) month count into
 *  bigint arithmetic. A micro-month is ~2.6 seconds, far finer than the day
 *  resolution the deadlines themselves have, so nothing observable changes. */
const MONTH_TICKS = 1_000_000;

/**
 * required_pace = (target_amount − saved) / months_to_deadline — PRD §3.3.4.
 * Returns minor units/month. Null once the deadline has passed (avoid divide-by-near-zero).
 *
 * The division is bigint-exact: `Number(remaining)` used to round the
 * remaining amount to a double *before* dividing, so a large int8 goal was
 * projected from an amount that was not the stored one (GA-014 / MONEY-001).
 * The month count is scaled to an integer instead, and the amount never leaves
 * bigint.
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

  const ticks = BigInt(Math.round(months * MONTH_TICKS));
  if (ticks <= 0n) return null;

  // Ceiling division in bigint: (a + b - 1) / b, exact for positive operands.
  const numerator = remaining * BigInt(MONTH_TICKS);
  return (numerator + ticks - 1n) / ticks;
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

/**
 * Compares required pace against the actual average pace over the trailing
 * window. Both are bigint minor units/month — the call site used to funnel
 * them through Number() first, which is exactly the coercion GA-014 flagged.
 *
 * The tolerance band is applied by cross-multiplication rather than by
 * multiplying by 1.1/0.9, so the comparison is exact at any magnitude:
 *   actual ≥ required · (1 + t)  ⇔  actual · 100 ≥ required · (100 + tPercent)
 */
export function comparePace(
  requiredPace: bigint,
  actualPace: bigint,
  tolerancePercent = 10,
): PaceStatus {
  const scaledActual = actualPace * 100n;
  if (scaledActual >= requiredPace * BigInt(100 + tolerancePercent)) return "ahead";
  if (scaledActual < requiredPace * BigInt(100 - tolerancePercent)) return "behind";
  return "on_track";
}

/**
 * Actual average savings pace over the trailing window (minor units/month) — the
 * value fed into `comparePace` for the "в графике / отстаёте / опережаете" verdict
 * (PRD §3.3.4). Sums signed contributions whose `occurredAt` falls within
 * `windowMonths` of `from`, then divides by the window length.
 */
export function calcTrailingMonthlyPace(
  contributions: readonly { amount: bigint; occurredAt: string }[],
  from: Date = new Date(),
  windowMonths = 3,
): bigint {
  const windowStart = from.getTime() - windowMonths * DAYS_PER_MONTH * MS_PER_DAY;
  let sum = 0n;
  for (const c of contributions) {
    const t = new Date(c.occurredAt).getTime();
    if (Number.isNaN(t) || t < windowStart || t > from.getTime()) continue;
    sum += c.amount;
  }
  if (sum <= 0n) return 0n;
  return sum / BigInt(windowMonths);
}
