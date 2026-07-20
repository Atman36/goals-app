import { z } from "zod";
import { GOAL_SPHERES } from "@/lib/spheres";
import { MAX_INT8 } from "@/lib/utils/money";

export const currencySchema = z.enum(["RUB", "USD"]);
export type Currency = z.infer<typeof currencySchema>;

export const goalKindSchema = z.enum(["financial", "non_financial"]);
export const goalStatusSchema = z.enum(["active", "achieved", "archived"]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalIdSchema = z.uuid();

export const GOAL_STATUSES = goalStatusSchema.options;

/**
 * Legal goal status transitions (the single source of truth for both the
 * server-side guard in lib/db/queries/goals.ts `setGoalStatus` and the buttons
 * the UI is allowed to offer). Read as "from → the statuses it may move to":
 *
 *   active   → achieved | archived
 *   achieved → archived                 (an achieved goal can be put away…)
 *   archived → active                   (…and an archived one can be revived)
 *
 * Deliberately absent:
 *   achieved → active    a goal that was reached cannot be un-reached
 *   archived → achieved  achieving means working on it, so revive it first
 *
 * A no-op (from === to) is not a transition — callers treat it as an
 * idempotent success that writes nothing.
 */
const GOAL_STATUS_TRANSITIONS: Record<GoalStatus, readonly GoalStatus[]> = {
  active: ["achieved", "archived"],
  achieved: ["archived"],
  archived: ["active"],
};

export function canTransitionGoalStatus(from: GoalStatus, to: GoalStatus): boolean {
  return from !== to && GOAL_STATUS_TRANSITIONS[from].includes(to);
}

/** The statuses a goal may legally be in for a move *into* `to` to be allowed —
 *  i.e. the expected-status guard for a compare-and-set UPDATE. */
export function goalStatusSourcesFor(to: GoalStatus): GoalStatus[] {
  return GOAL_STATUSES.filter((from) => canTransitionGoalStatus(from, to));
}

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
  sphere: z.enum(GOAL_SPHERES).nullable().optional(),
});

// Amounts are persisted in PostgreSQL int8 columns: an out-of-range bigint
// would reach the driver and fail the INSERT (HTTP 500) instead of the caller's
// normal validation-error path, so the upper bound is asserted here.
export const financialGoalSchema = goalBaseSchema.extend({
  kind: z.literal("financial"),
  currency: currencySchema,
  targetAmount: z.bigint().positive().lte(MAX_INT8, "Сумма слишком большая"),
  initialAmount: z.bigint().nonnegative().lte(MAX_INT8, "Сумма слишком большая").default(0n),
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
