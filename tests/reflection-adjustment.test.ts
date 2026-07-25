import { describe, expect, it } from "vitest";

import { shouldShowReflectionAdjustment } from "@/lib/utils/reflection-adjustment";

// T14 (PLAN §5 B4). Pure logic behind the reflection form's plan-adjustment
// node visibility — same node as T13's check-in card, gated on the reflection
// save succeeding rather than on picking "partial" (Decisions D1/D3 in T14's
// spec). Kept outside the component per Decisions D8 (no component-testing
// library in this project).

const base = {
  status: "success" as const,
  prevOutcome: "partial" as const,
  prevPromiseGoalId: "goal-1",
};

describe("shouldShowReflectionAdjustment", () => {
  it("is false when status is idle", () => {
    expect(shouldShowReflectionAdjustment({ ...base, status: "idle" })).toBe(false);
  });

  it("is false when status is error", () => {
    expect(shouldShowReflectionAdjustment({ ...base, status: "error" })).toBe(false);
  });

  it("is false when status is stale", () => {
    expect(shouldShowReflectionAdjustment({ ...base, status: "stale" })).toBe(false);
  });

  it("is false when prevOutcome is done, even on success", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevOutcome: "done" })).toBe(false);
  });

  it("is false when prevOutcome is null, even on success", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevOutcome: null })).toBe(false);
  });

  it("is false when prevPromiseGoalId is null, on success + partial", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevPromiseGoalId: null })).toBe(false);
  });

  it("is false when prevPromiseGoalId is an empty string", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevPromiseGoalId: "" })).toBe(false);
  });

  it("is true on success + partial + a non-empty goal id", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevOutcome: "partial" })).toBe(true);
  });

  it("is true on success + skipped + a non-empty goal id", () => {
    expect(shouldShowReflectionAdjustment({ ...base, prevOutcome: "skipped" })).toBe(true);
  });
});
