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
/** Whole part required, at most two decimal places — the resolution of every
 *  currency the product supports. */
const NON_NEGATIVE_DECIMAL_STRING_RE = /^\d+(?:\.\d{1,2})?$/;

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

// `toMinorUnits(amountMajor: number)` used to live here — deleted with GA-014.
// It was the last float door into a write path (BigInt(Math.round(n * 100))):
// every caller had a *string* from a form field, so the Number hop only ever
// lost precision. Use parseMajorDecimalToMinor (typed decimals) or
// parseMajorAmountToMinor (whole amounts) instead; both take the string
// directly. Presets are whole major units and multiply by
// MINOR_UNITS_PER_MAJOR in bigint at the call site.

/** Exact major-unit digit string → bigint minor units, or null when the input
 *  isn't a whole non-negative amount or the result wouldn't fit int8.
 *  No Number round-trip: the string is parsed straight into a BigInt, so the
 *  stored value is exactly what the user typed. Range-checking here is what
 *  turns an oversized amount into a normal validation failure instead of a
 *  driver-level INSERT error (HTTP 500). */
/** Exact major-unit DECIMAL string → bigint minor units ("19.99" → 1999n), or
 *  null when the input isn't a non-negative amount with at most two decimal
 *  places, or the result wouldn't fit int8.
 *
 *  The sibling of parseMajorAmountToMinor for the one input that legitimately
 *  accepts kopecks/cents: the quick-add "своя сумма" field. That field used to
 *  go through Number(text) and Math.round(n * 100), which is a double round
 *  trip — past Number.MAX_SAFE_INTEGER it stored a different amount than the
 *  user typed, and even inside the safe range `19.99 * 100` is 1998.9999…
 *  (GA-014 / MONEY-001). Here the decimal point is removed by string surgery
 *  and BigInt does the rest, so nothing is ever approximated.
 *
 *  A comma is accepted as the decimal separator: the field is inputMode
 *  "decimal", and a ru-RU keyboard offers a comma. */
export function parseMajorDecimalToMinor(value: string): bigint | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed.length === 0 || trimmed.length > MAX_AMOUNT_INPUT_LENGTH) return null;
  if (!NON_NEGATIVE_DECIMAL_STRING_RE.test(trimmed)) return null;

  const [whole, frac = ""] = trimmed.split(".");
  // "19.9" is 19 rubles 90 kopecks, not 19 rubles 9 kopecks.
  const minor = BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(frac.padEnd(2, "0"));
  return isWithinInt8(minor) ? minor : null;
}

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
/** Coarse magnitude bucket for analytics — computed by bigint comparison, so a
 *  huge amount is classified without ever being converted to a double, and the
 *  exact amount never leaves this function (PRD §8.4 `contribution_added`
 *  carries a bucket, never a value — GA-014/GA-011). */
export function amountMagnitudeBucket(amountMinor: bigint): "<1k" | "1k-10k" | ">10k" {
  const abs = amountMinor < 0n ? -amountMinor : amountMinor;
  const major = abs / MINOR_UNITS_PER_MAJOR;
  if (major < 1_000n) return "<1k";
  if (major <= 10_000n) return "1k-10k";
  return ">10k";
}

export function calcFinancialProgress(saved: bigint, targetAmount: bigint): number {
  if (targetAmount <= 0n) return 0;
  if (saved <= 0n) return 0;
  if (saved >= targetAmount) return 1;
  return Number((saved * 100n) / targetAmount) / 100;
}

export { MINOR_UNITS_PER_MAJOR };
