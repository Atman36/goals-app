import { z } from "zod";

// T12 (PLAN §5 B4). The "узел сличения" node's input contract: what a person
// chose after an honest "partial"/"skipped", plus the fields each decision
// needs. Each decision carries exactly its own fields — nothing spare, and
// nothing missing (Decisions in T12's spec).

export const PLAN_ADJUSTMENT_SOURCES = ["checkin", "reflection"] as const;
export const PLAN_ADJUSTMENT_DECISIONS = [
  "keep",
  "smaller",
  "change_trigger",
  "add_coping_plan",
  "pause_goal",
  "drop_goal",
] as const;
export const PLAN_ADJUSTMENT_BARRIERS = [
  "time",
  "energy",
  "emotion",
  "unclear_step",
  "wrong_context",
  "forgot",
  "competing_goal",
  "external_event",
  "not_my_goal_anymore",
] as const;

export type PlanAdjustmentSource = (typeof PLAN_ADJUSTMENT_SOURCES)[number];
export type PlanAdjustmentDecision = (typeof PLAN_ADJUSTMENT_DECISIONS)[number];
export type PlanAdjustmentBarrier = (typeof PLAN_ADJUSTMENT_BARRIERS)[number];

/** Decisions that change nothing about the step — none of the step-editing
 *  fields may be sent alongside them. */
const NO_STEP_FIELD_DECISIONS = new Set<PlanAdjustmentDecision>(["keep", "pause_goal", "drop_goal"]);

export const planAdjustmentInputSchema = z
  .object({
    goalId: z.uuid(),
    source: z.enum(PLAN_ADJUSTMENT_SOURCES),
    // Daily day token when source="checkin", week-start token when
    // source="reflection" — resolved against the server clock in the action
    // (resolveCheckinDate / resolveReflectionWeek), never trusted as-is.
    expectedToken: z.string(),
    barrier: z.enum(PLAN_ADJUSTMENT_BARRIERS),
    decision: z.enum(PLAN_ADJUSTMENT_DECISIONS),
    checklistItemId: z.uuid().optional(),
    stepTitle: z.string().trim().min(1).max(200).optional(),
    trigger: z.string().trim().min(1).max(280).optional(),
    copingTrigger: z.string().trim().min(1).max(280).optional(),
    copingAction: z.string().trim().min(1).max(280).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "smaller") {
      if (!data.checklistItemId) {
        ctx.addIssue({
          code: "custom",
          message: "checklistItemId is required for 'smaller'",
          path: ["checklistItemId"],
        });
      }
      if (!data.stepTitle) {
        ctx.addIssue({
          code: "custom",
          message: "stepTitle is required for 'smaller'",
          path: ["stepTitle"],
        });
      }
    }

    if (data.decision === "change_trigger") {
      if (!data.checklistItemId) {
        ctx.addIssue({
          code: "custom",
          message: "checklistItemId is required for 'change_trigger'",
          path: ["checklistItemId"],
        });
      }
      if (!data.trigger) {
        ctx.addIssue({
          code: "custom",
          message: "trigger is required for 'change_trigger'",
          path: ["trigger"],
        });
      }
    }

    if (data.decision === "add_coping_plan") {
      if (!data.copingTrigger) {
        ctx.addIssue({
          code: "custom",
          message: "copingTrigger is required for 'add_coping_plan'",
          path: ["copingTrigger"],
        });
      }
      if (!data.copingAction) {
        ctx.addIssue({
          code: "custom",
          message: "copingAction is required for 'add_coping_plan'",
          path: ["copingAction"],
        });
      }
      if (data.checklistItemId) {
        ctx.addIssue({
          code: "custom",
          message: "checklistItemId is not allowed for 'add_coping_plan'",
          path: ["checklistItemId"],
        });
      }
    }

    if (NO_STEP_FIELD_DECISIONS.has(data.decision)) {
      if (data.checklistItemId) {
        ctx.addIssue({
          code: "custom",
          message: `checklistItemId is not allowed for '${data.decision}'`,
          path: ["checklistItemId"],
        });
      }
      if (data.stepTitle) {
        ctx.addIssue({
          code: "custom",
          message: `stepTitle is not allowed for '${data.decision}'`,
          path: ["stepTitle"],
        });
      }
      if (data.trigger) {
        ctx.addIssue({
          code: "custom",
          message: `trigger is not allowed for '${data.decision}'`,
          path: ["trigger"],
        });
      }
      if (data.copingTrigger) {
        ctx.addIssue({
          code: "custom",
          message: `copingTrigger is not allowed for '${data.decision}'`,
          path: ["copingTrigger"],
        });
      }
      if (data.copingAction) {
        ctx.addIssue({
          code: "custom",
          message: `copingAction is not allowed for '${data.decision}'`,
          path: ["copingAction"],
        });
      }
    }
  });

export type PlanAdjustmentInput = z.infer<typeof planAdjustmentInputSchema>;
