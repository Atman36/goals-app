import { z } from "zod";

// WOOP (Wish / Outcome / Obstacle / Plan) — PRD §3.2 Phase 2 methodology step.
// All four fields are required once the step is submitted with any content;
// the wizard itself decides whether to call this at all (empty step = skip,
// no WOOP saved) — see lib/actions/goals.ts's createGoal.
export const woopInputSchema = z.object({
  wish: z.string().trim().min(1).max(120),
  outcome: z.string().trim().min(1).max(1000),
  obstacle: z.string().trim().min(1).max(1000),
  plan: z.string().trim().min(1).max(1000),
});

export type WoopInput = z.infer<typeof woopInputSchema>;
