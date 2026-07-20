import { describe, expect, it } from "vitest";
import { checkinInputSchema } from "@/lib/validators/checkin";

const VALID_GOAL_ID = "3c1f6f7e-6b1a-4c1a-9b1a-1e1a1a1a1a1a";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    goalId: VALID_GOAL_ID,
    expectedDate: "2026-07-20",
    outcome: "done",
    feeling: 3,
    note: "Норм день",
    ...overrides,
  };
}

describe("checkinInputSchema", () => {
  it("accepts a full valid object", () => {
    const result = checkinInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects feeling 0 (below range)", () => {
    const result = checkinInputSchema.safeParse(validInput({ feeling: 0 }));
    expect(result.success).toBe(false);
  });

  it("accepts feeling 1 (lower boundary)", () => {
    const result = checkinInputSchema.safeParse(validInput({ feeling: 1 }));
    expect(result.success).toBe(true);
  });

  it("accepts feeling 5 (upper boundary)", () => {
    const result = checkinInputSchema.safeParse(validInput({ feeling: 5 }));
    expect(result.success).toBe(true);
  });

  it("rejects feeling 6 (above range)", () => {
    const result = checkinInputSchema.safeParse(validInput({ feeling: 6 }));
    expect(result.success).toBe(false);
  });

  it("rejects feeling 3.5 (not an integer)", () => {
    const result = checkinInputSchema.safeParse(validInput({ feeling: 3.5 }));
    expect(result.success).toBe(false);
  });

  it.each(["done", "partial", "skipped"] as const)("accepts outcome %s", (outcome) => {
    const result = checkinInputSchema.safeParse(validInput({ outcome }));
    expect(result.success).toBe(true);
  });

  it("rejects an invalid outcome", () => {
    const result = checkinInputSchema.safeParse(validInput({ outcome: "maybe" }));
    expect(result.success).toBe(false);
  });

  it("accepts a note of exactly 2000 characters", () => {
    const result = checkinInputSchema.safeParse(validInput({ note: "a".repeat(2000) }));
    expect(result.success).toBe(true);
  });

  it("rejects a note of 2001 characters", () => {
    const result = checkinInputSchema.safeParse(validInput({ note: "a".repeat(2001) }));
    expect(result.success).toBe(false);
  });

  it("parses an empty-string note as undefined", () => {
    const result = checkinInputSchema.safeParse(validInput({ note: "" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });

  it("rejects a non-uuid goalId", () => {
    const result = checkinInputSchema.safeParse(validInput({ goalId: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });
});
