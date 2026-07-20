import { z } from "zod";
import { dateKeySchema } from "@/lib/validators/date-key";
import { todayKey, type DateKey } from "@/lib/utils/date-keys";

// Outcome labels — non-shaming, "не сегодня" is a valid, honestly-marked
// outcome (growth-reactor v5 §5/§6/§12 Decisions).
export const checkinOutcomeValues = ["done", "partial", "skipped"] as const;
export type CheckinOutcome = (typeof checkinOutcomeValues)[number];

export const checkinInputSchema = z.object({
  goalId: z.uuid(),
  // The UTC day the form was RENDERED for — see the day-token contract below.
  expectedDate: dateKeySchema,
  outcome: z.enum(checkinOutcomeValues),
  feeling: z.number().int().min(1).max(5),
  // Empty note (e.g. an untouched textarea) parses as no note, not as "".
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type CheckinInput = z.infer<typeof checkinInputSchema>;

// --- Day token (GA-013) ----------------------------------------------------
// The same defect CR-030 fixed for weekly reflections, on the daily form:
// /today renders the check-in for the day that is current at *render* time,
// but the save happens later — potentially after the UTC midnight boundary.
// Without a token the action just recomputed todayKey() and filed the day D
// form the user was looking at under day D+1. The owner is at UTC+5, so the
// boundary lands at 05:00 local: reachable in practice, not theoretical.
//
// Contract (deliberately identical to resolveReflectionWeek):
//   - The server component computes the current day key and passes it to the
//     form, which posts it back verbatim as `expectedDate`.
//   - The action re-derives the current day key and accepts the write only
//     when the posted token equals it.
//   - The token is an equality check ONLY. The value written to the DB is
//     always the server-derived key, so a forged token cannot target another
//     day — worst case it fails the check and the user is asked to reload.
//   - Missing, malformed, and non-matching tokens all resolve the same way:
//     refuse the write and report the current day so the UI can prompt a
//     reload.
export type CheckinDateResolution =
  | { ok: true; date: DateKey }
  | { ok: false; currentDate: DateKey };

/** Validates a posted `expectedDate` token against the day that is current on
 *  the server. `now` is injectable so the midnight crossing is testable
 *  without real time. */
export function resolveCheckinDate(token: unknown, now: Date = new Date()): CheckinDateResolution {
  const currentDate = todayKey(now);
  const parsed = dateKeySchema.safeParse(token);
  if (!parsed.success || parsed.data !== currentDate) {
    return { ok: false, currentDate };
  }
  // Deliberately returns the server-derived key, not `parsed.data`.
  return { ok: true, date: currentDate };
}
