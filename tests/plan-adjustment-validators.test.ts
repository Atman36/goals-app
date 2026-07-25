import { describe, expect, it } from "vitest";
import { planAdjustmentInputSchema } from "@/lib/validators/plan-adjustment";

// T12 (PLAN §5 B4). Pins the per-decision required-field shape so a form that
// posts the wrong subset for a decision fails here rather than silently
// writing a half-formed adjustment.

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

function base(overrides: Record<string, unknown> = {}) {
  return {
    goalId: GOAL_ID,
    source: "checkin",
    expectedToken: "2026-07-25",
    barrier: "time",
    decision: "keep",
    ...overrides,
  };
}

describe("planAdjustmentInputSchema", () => {
  it("rejects an unknown decision", () => {
    expect(planAdjustmentInputSchema.safeParse(base({ decision: "give_up" })).success).toBe(false);
  });

  it("rejects an unknown barrier", () => {
    expect(planAdjustmentInputSchema.safeParse(base({ barrier: "laziness" })).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(planAdjustmentInputSchema.safeParse(base({ source: "review" })).success).toBe(false);
  });

  it("rejects 'smaller' without checklistItemId", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "smaller", stepTitle: "Меньший шаг" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'smaller' without stepTitle", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "smaller", checklistItemId: ITEM_ID }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts 'smaller' with both checklistItemId and stepTitle", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "smaller", checklistItemId: ITEM_ID, stepTitle: "Меньший шаг" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects 'change_trigger' without trigger", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "change_trigger", checklistItemId: ITEM_ID }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'change_trigger' without checklistItemId", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "change_trigger", trigger: "после обеда" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts 'change_trigger' with checklistItemId and trigger", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "после обеда" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects 'add_coping_plan' without copingAction", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "add_coping_plan", copingTrigger: "если тревога" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'add_coping_plan' without copingTrigger", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "add_coping_plan", copingAction: "сделать паузу" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'add_coping_plan' with a checklistItemId", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({
        decision: "add_coping_plan",
        copingTrigger: "если тревога",
        copingAction: "сделать паузу",
        checklistItemId: ITEM_ID,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts 'add_coping_plan' with copingTrigger and copingAction only", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({
        decision: "add_coping_plan",
        copingTrigger: "если тревога",
        copingAction: "сделать паузу",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects 'keep' with a stepTitle", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "keep", stepTitle: "Меньший шаг" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'pause_goal' with a checklistItemId", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "pause_goal", checklistItemId: ITEM_ID }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'drop_goal' with a trigger", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "drop_goal", trigger: "после обеда" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts 'keep' with none of the decision-specific fields", () => {
    const result = planAdjustmentInputSchema.safeParse(base({ decision: "keep" }));
    expect(result.success).toBe(true);
  });

  it("rejects a stepTitle of 201 characters", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "smaller", checklistItemId: ITEM_ID, stepTitle: "a".repeat(201) }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a stepTitle of 200 characters", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "smaller", checklistItemId: ITEM_ID, stepTitle: "a".repeat(200) }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a trigger of 281 characters", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "a".repeat(281) }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a trigger of 280 characters", () => {
    const result = planAdjustmentInputSchema.safeParse(
      base({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "a".repeat(280) }),
    );
    expect(result.success).toBe(true);
  });
});
