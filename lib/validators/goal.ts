import { z } from "zod";

export const currencySchema = z.enum(["RUB", "USD"]);
export type Currency = z.infer<typeof currencySchema>;

export const goalKindSchema = z.enum(["financial", "non_financial"]);
export const goalStatusSchema = z.enum(["active", "achieved", "archived"]);

export const selfConcordanceSchema = z.object({
  interest: z.number().int().min(1).max(5),
  values: z.number().int().min(1).max(5),
  guilt: z.number().int().min(1).max(5),
  externalPressure: z.number().int().min(1).max(5),
});

const goalBaseSchema = z.object({
  title: z.string().trim().min(3).max(60),
  description: z.string().max(4000).optional(),
  deadline: z.coerce.date(),
  coverImageId: z.uuid().optional(),
  selfConcordance: selfConcordanceSchema.optional(),
});

export const financialGoalSchema = goalBaseSchema.extend({
  kind: z.literal("financial"),
  currency: currencySchema,
  targetAmount: z.bigint().positive(),
  initialAmount: z.bigint().nonnegative().default(0n),
});

export const nonFinancialGoalSchema = goalBaseSchema.extend({
  kind: z.literal("non_financial"),
  currency: z.undefined(),
  targetAmount: z.undefined(),
  initialAmount: z.undefined(),
});

// Discriminated union enforces the PRD §4 invariant at the type + runtime level:
// financial ⇒ currency & targetAmount required; non_financial ⇒ both forbidden.
export const goalSchema = z.discriminatedUnion("kind", [
  financialGoalSchema,
  nonFinancialGoalSchema,
]);

export type GoalInput = z.infer<typeof goalSchema>;

// A goal's currency may only change while it has zero non-deleted contributions —
// enforced in the update Server Action, not here (requires a DB read).
export const goalUpdateSchema = goalSchema.and(z.object({ id: z.uuid() }));
