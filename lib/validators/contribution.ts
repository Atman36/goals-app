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
