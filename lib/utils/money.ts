import type { Currency } from "@/lib/validators/goal";

const MINOR_UNITS_PER_MAJOR = 100n;

const INTL_CURRENCY: Record<Currency, string> = {
  RUB: "RUB",
  USD: "USD",
};

/** Converts a bigint amount in minor units (kopecks/cents) to a major-unit number for display. */
export function toMajorUnits(amountMinor: bigint): number {
  return Number(amountMinor) / 100;
}

/** Converts a major-unit input (e.g. from a form) to bigint minor units. Truncates sub-cent input. */
export function toMinorUnits(amountMajor: number): bigint {
  return BigInt(Math.round(amountMajor * 100));
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

/** progress = saved / target_amount, clamped to [0, 1] — PRD §4 */
export function calcFinancialProgress(saved: bigint, targetAmount: bigint): number {
  if (targetAmount <= 0n) return 0;
  const ratio = Number(saved) / Number(targetAmount);
  return Math.min(1, Math.max(0, ratio));
}

export { MINOR_UNITS_PER_MAJOR };
