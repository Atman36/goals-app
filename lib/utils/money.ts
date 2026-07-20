import type { Currency } from "@/lib/validators/goal";

const MINOR_UNITS_PER_MAJOR = 100n;

const INTL_CURRENCY: Record<Currency, string> = {
  RUB: "RUB",
  USD: "USD",
};

/** PostgreSQL `bigint` (int8) column bounds — every money value we persist
 *  lives in an int8 column, so anything outside this range must be rejected as
 *  a validation error rather than handed to the driver (which fails the INSERT
 *  with a 500 instead of a field error). */
export const MIN_INT8 = -(2n ** 63n);
export const MAX_INT8 = 2n ** 63n - 1n;

/** Upper bound on the raw digit-string length we are willing to run BigInt()
 *  over. Anything this long is out of int8 range many times over; the cap
 *  keeps an adversarial multi-megabyte digit string from being parsed at all. */
const MAX_AMOUNT_INPUT_LENGTH = 40;

const INTEGER_STRING_RE = /^-?\d+$/;
const NON_NEGATIVE_INTEGER_STRING_RE = /^\d+$/;

/** True when the bigint fits a PostgreSQL int8 column. */
export function isWithinInt8(value: bigint): boolean {
  return value >= MIN_INT8 && value <= MAX_INT8;
}

/** Total (never-throwing) predicate: is `value` a plain integer string that
 *  fits int8? Safe to call from a Zod refinement on unvalidated input — it
 *  does its own shape check before touching BigInt(). */
export function isInt8IntegerString(value: string): boolean {
  if (value.length === 0 || value.length > MAX_AMOUNT_INPUT_LENGTH) return false;
  if (!INTEGER_STRING_RE.test(value)) return false;
  return isWithinInt8(BigInt(value));
}

/** Same as isInt8IntegerString, but rejects a leading "-" — for wire fields
 *  that carry an unsigned magnitude and a separate sign flag. */
export function isInt8NonNegativeIntegerString(value: string): boolean {
  if (!NON_NEGATIVE_INTEGER_STRING_RE.test(value)) return false;
  return isInt8IntegerString(value);
}

/** Exact bigint minor units → major-unit decimal string ("1999" → "19.99").
 *  Pure integer arithmetic: unlike toMajorUnits this never routes through a
 *  double, so it stays exact for values past Number.MAX_SAFE_INTEGER. */
export function toMajorUnitsString(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const whole = abs / MINOR_UNITS_PER_MAJOR;
  const frac = abs % MINOR_UNITS_PER_MAJOR;
  const body = frac === 0n ? `${whole}` : `${whole}.${frac.toString().padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Converts a bigint amount in minor units (kopecks/cents) to a major-unit number for display.
 *  Goes via the exact decimal string above rather than Number(amountMinor)/100 —
 *  decimal-string parsing and division are both correctly rounded, so every
 *  in-range value converts identically, while huge values no longer lose their
 *  integer part before the division. */
export function toMajorUnits(amountMinor: bigint): number {
  return Number(toMajorUnitsString(amountMinor));
}

/** Converts a major-unit input (e.g. from a form) to bigint minor units. Truncates sub-cent input. */
export function toMinorUnits(amountMajor: number): bigint {
  return BigInt(Math.round(amountMajor * 100));
}

/** Exact major-unit digit string → bigint minor units, or null when the input
 *  isn't a whole non-negative amount or the result wouldn't fit int8.
 *  No Number round-trip: the string is parsed straight into a BigInt, so the
 *  stored value is exactly what the user typed. Range-checking here is what
 *  turns an oversized amount into a normal validation failure instead of a
 *  driver-level INSERT error (HTTP 500). */
export function parseMajorAmountToMinor(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_AMOUNT_INPUT_LENGTH) return null;
  if (!NON_NEGATIVE_INTEGER_STRING_RE.test(trimmed)) return null;
  const minor = BigInt(trimmed) * MINOR_UNITS_PER_MAJOR;
  return isWithinInt8(minor) ? minor : null;
}

export function formatMoney(amountMinor: bigint, currency: Currency): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: INTL_CURRENCY[currency],
    maximumFractionDigits: 0,
  }).format(toMajorUnits(amountMinor));
}

/** saved = initial_amount + SUM(contributions.amount where deleted_at is null) — PRD §4 */
export function calcSaved(initialAmount: bigint, contributionAmounts: bigint[]): bigint {
  return contributionAmounts.reduce((sum, amount) => sum + amount, initialAmount);
}

/**
 * progress = saved / target_amount, clamped to [0, 1] — PRD §4.
 *
 * Returns exactly 1 only when the target is genuinely met (saved >= target).
 * A short-of-target amount is floored to whole percent via bigint division, so
 * every caller's `Math.round(progress * 100)` reports 99 rather than 100 while
 * even one kopeck is missing (saved=9_999_999 / target=10_000_000 used to round
 * up to a "completed" 100%). Whole-percent resolution is also the display
 * resolution everywhere (progress rings and percent labels), so nothing visible
 * is lost. Bigint division also keeps this exact past Number.MAX_SAFE_INTEGER.
 */
export function calcFinancialProgress(saved: bigint, targetAmount: bigint): number {
  if (targetAmount <= 0n) return 0;
  if (saved <= 0n) return 0;
  if (saved >= targetAmount) return 1;
  return Number((saved * 100n) / targetAmount) / 100;
}

export { MINOR_UNITS_PER_MAJOR };
