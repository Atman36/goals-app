import { z } from "zod";
import { checkinOutcomeValues } from "@/lib/validators/checkin";
import { todayKey, type DateKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";

// The 5 weekly-reflection questions (growth-reactor v5 §6/§11/§12 Decisions).
// Empty optional fields (e.g. an untouched textarea) parse as no value, not
// as "" — mirrors checkinInputSchema's note field.
export const reflectionInputSchema = z.object({
  promised: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  done: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  blocked: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  learned: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  // The only required question — "Что я обещаю себе на эту неделю?".
  promise: z.string().trim().min(1).max(2000),
  // The previous week's promise outcome — shared vocabulary with daily
  // check-ins (required only when a previous promise exists; enforced in
  // lib/actions/reflections.ts, not here).
  prevOutcome: z.enum(checkinOutcomeValues).optional(),
  newIfThen: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ReflectionInput = z.infer<typeof reflectionInputSchema>;

// --- Week token (CR-030) ---------------------------------------------------
// /reflections renders the week's questions for the week that was current at
// *render* time, but the save happens later — potentially after the week
// boundary (Monday 00:00 UTC) has passed. Without a token, the action just
// recomputed "now"'s week and silently wrote week W's answers into week W+1,
// validating the wrong prior promise. The owner is at UTC+5, so the boundary
// lands at 05:00 local Monday: reachable in practice, not a theoretical race.
//
// Contract:
//   - The server component computes the current week-start key and passes it
//     to the form, which posts it back verbatim in a hidden `expectedWeekStart`
//     field.
//   - The action re-derives the current week-start key server-side and accepts
//     the write only when the posted token equals it.
//   - The token is an equality check ONLY. The value written to the DB is
//     always the server-derived key — a client-supplied string is never used
//     as a week key, so a forged token cannot target another week (worst case
//     it fails the equality check and the user is asked to reload).
//   - A missing, malformed, or non-matching token all resolve the same way:
//     refuse the write and report the current week so the UI can prompt a
//     reload.
export const weekStartTokenSchema = z.iso.date();

export type ReflectionWeekResolution =
  | { ok: true; weekStart: DateKey }
  | { ok: false; currentWeekStart: DateKey };

/** Validates a posted `expectedWeekStart` token against the week that is
 *  current on the server. `now` is injectable so the boundary crossing is
 *  testable without real time. */
export function resolveReflectionWeek(
  token: unknown,
  now: Date = new Date(),
): ReflectionWeekResolution {
  const currentWeekStart = weekStartKey(todayKey(now));
  const parsed = weekStartTokenSchema.safeParse(token);
  if (!parsed.success || parsed.data !== currentWeekStart) {
    return { ok: false, currentWeekStart };
  }
  // Deliberately returns the server-derived key, not `parsed.data`.
  return { ok: true, weekStart: currentWeekStart };
}
