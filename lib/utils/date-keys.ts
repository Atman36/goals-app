/** A calendar date as "yyyy-MM-dd". */
export type DateKey = string;

/** Convert a Date to its UTC calendar-date key (matches the app's
 *  toISOString().slice(0,10) convention). */
export function toDateKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

/** Today's key. Injectable clock for testing/determinism. */
export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

/** Whole calendar days from `fromKey` to `toKey` (toKey - fromKey).
 *  Positive = toKey is later. Parses each key as UTC midnight. */
export function daysBetweenKeys(fromKey: DateKey, toKey: DateKey): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}
