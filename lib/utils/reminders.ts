import { daysBetweenKeys, type DateKey } from "@/lib/utils/date-keys";
import { pluralRu } from "@/lib/utils/plural";

export type DueBucket = "overdue" | "today" | "soon" | "later";

/** Classify a due/deadline date relative to today. Returns null if no date. */
export function classifyDue(
  dateKey: DateKey | null | undefined,
  todayK: DateKey,
  soonWithinDays = 7,
): DueBucket | null {
  if (!dateKey) return null;
  const delta = daysBetweenKeys(todayK, dateKey); // future = positive
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  if (delta <= soonWithinDays) return "soon";
  return "later";
}

/** Russian human label for a due date, e.g.
 *  overdue → "Просрочено на 3 дня"; today → "Сегодня";
 *  soon/later → "Через 5 дней". Returns "" if no date. */
export function formatDueLabelRu(dateKey: DateKey | null | undefined, todayK: DateKey): string {
  if (!dateKey) return "";
  const delta = daysBetweenKeys(todayK, dateKey);
  if (delta === 0) return "Сегодня";
  const n = Math.abs(delta);
  const days = pluralRu(n, "день", "дня", "дней");
  return delta < 0 ? `Просрочено на ${n} ${days}` : `Через ${n} ${days}`;
}
