import { z } from "zod";

// One strict calendar-date contract for every date-ONLY field in the product
// (goal deadline, checklist due date, contribution date, check-in day). Every
// such value lands in a PostgreSQL `date` column and is read back as a
// "YYYY-MM-DD" string, so the string — not a Date — is the canonical form.
//
// Why this replaced `z.coerce.date()` (GA-018 / CR-023): coercion runs the
// value through the JavaScript Date constructor, which *normalizes* rather
// than rejects. "2026-02-31" silently became 2026-03-03 and "2026-06-01T00:00
// +05:00" became 2026-05-31 — the API stored a day the client never selected,
// on both the Server Action and the /api/v1 write path.
//
// The rule here is a round trip: parse the components as UTC, render them back,
// and require a byte-identical string. Anything the Date constructor would have
// quietly shifted fails that comparison, so an impossible date is an input
// error instead of a different date.

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DATE_KEY_ERROR = "Некорректная дата (ожидается ГГГГ-ММ-ДД)";

/** Total (never-throwing) predicate: is `value` a real calendar date written
 *  exactly as YYYY-MM-DD? Safe to call from a Zod refinement on unvalidated
 *  input — the shape check runs before any Date construction, and the widest
 *  string the regex admits (year 9999, month 99, day 99) stays far inside the
 *  Date range, so `toISOString()` cannot throw. */
export function isCalendarDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  // Rejects years 0000-0099 as a side effect: Date.UTC maps them into the
  // 1900s, so the round trip below no longer matches. That is the desired
  // answer for a product whose dates are all near-present.
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.toISOString().slice(0, 10) === value;
}

/** The shared schema. Keep date keys as strings from validation through SQL
 *  parameter binding — no Date hop, so no timezone can re-key them. */
export const dateKeySchema = z.string().refine(isCalendarDateKey, DATE_KEY_ERROR);
