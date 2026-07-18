import { z } from "zod";
import { checkinOutcomeValues } from "@/lib/validators/checkin";

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
