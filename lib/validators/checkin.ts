import { z } from "zod";

// Outcome labels — non-shaming, "не сегодня" is a valid, honestly-marked
// outcome (growth-reactor v5 §5/§6/§12 Decisions).
export const checkinOutcomeValues = ["done", "partial", "skipped"] as const;
export type CheckinOutcome = (typeof checkinOutcomeValues)[number];

export const checkinInputSchema = z.object({
  goalId: z.uuid(),
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
