import { z } from "zod";

// id is client-generated for idempotency — PRD §3.3.1/§7.
export const contributionSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid(),
  amount: z.bigint().refine((v) => v !== 0n, "Amount must not be zero"),
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
  amountMinor: z.string().regex(/^\d+$/, "amountMinor must be a non-negative integer string"),
  note: z.string().max(280).optional(),
  occurredAt: z.coerce.date(),
  isNegative: z.boolean().optional().default(false),
  // Client-side only knowledge (which preset button, if any, was used) — for
  // the contribution_added {is_preset} analytics prop (PRD §8.4).
  isPreset: z.boolean().optional().default(false),
});

export const contributionDeleteQuerySchema = z.object({ goalId: z.uuid() });
