import { z } from "zod";
import { isInt8NonNegativeIntegerString, isWithinInt8 } from "@/lib/utils/money";

// id is client-generated for idempotency — PRD §3.3.1/§7.
export const contributionSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid(),
  amount: z
    .bigint()
    .refine((v) => v !== 0n, "Amount must not be zero")
    // contributions.amount is a PostgreSQL int8 column — an out-of-range value
    // would blow up the INSERT with a driver error (HTTP 500) instead of
    // failing validation, so the bound is enforced before the DB sees it.
    .refine(isWithinInt8, "Amount is out of range"),
  note: z.string().max(280).optional(),
  occurredAt: z.coerce.date(),
});

export type ContributionInput = z.infer<typeof contributionSchema>;

// Route param schema for app/api/v1/contributions/[contributionId] —
// imported rather than written as a bare z.uuid() call in the route file
// itself, so every schema definition stays under lib/validators.
export const contributionIdSchema = z.uuid();

// Wire (request-body/query) schemas for app/api/v1/**/contributions routes —
// distinct from contributionSchema (the domain schema), which needs goalId
// injected from the route param and the signed amount computed first.
//
// Client sends the unsigned magnitude in minor units (string, JSON can't
// carry bigint) plus a sign flag — PRD §3.3.1 (contribution vs "списание").
export const contributionPostBodySchema = z.object({
  id: z.uuid(),
  // A single total refinement rather than .regex().max().refine(): Zod v4 runs
  // every check on a string even after an earlier one fails, so a BigInt() call
  // spread across chained checks would throw on non-numeric input. The bound is
  // int8 (the amount column's type) — without it a long digit string reaches
  // the driver and turns a validation error into an HTTP 500.
  amountMinor: z
    .string()
    .refine(
      isInt8NonNegativeIntegerString,
      "amountMinor must be a non-negative integer string within int8 range",
    ),
  note: z.string().max(280).optional(),
  occurredAt: z.coerce.date(),
  isNegative: z.boolean().optional().default(false),
  // Client-side only knowledge (which preset button, if any, was used) — for
  // the contribution_added {is_preset} analytics prop (PRD §8.4).
  isPreset: z.boolean().optional().default(false),
});

export const contributionDeleteQuerySchema = z.object({ goalId: z.uuid() });
