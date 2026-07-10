import { toDateKey, type DateKey } from "@/lib/utils/date-keys";

/** Monday-anchored week-start key (UTC) for the week containing `key`.
 *  Uses ISO weeks (Monday…Sunday) to stay consistent with the app's
 *  UTC date-key convention in date-keys.ts. */
export function weekStartKey(key: DateKey): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toDateKey(date);
}

/** The Monday-anchored week-start key of the week before `weekKey`. */
export function previousWeekKey(weekKey: DateKey): DateKey {
  const [y, m, d] = weekKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 7));
  return toDateKey(date);
}
