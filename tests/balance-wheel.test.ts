import { describe, expect, it } from "vitest";
import { buildBalanceWheel } from "@/lib/utils/balance-wheel";
import { GOAL_SPHERES } from "@/lib/spheres";

describe("buildBalanceWheel", () => {
  it("returns 8 zeroed slices for empty input", () => {
    const result = buildBalanceWheel([]);
    expect(result.slices).toHaveLength(8);
    expect(result.slices.every((s) => s.activeGoals === 0 && s.weekEvents === 0)).toBe(true);
    expect(result.unassignedGoals).toBe(0);
    expect(result.maxWeekEvents).toBe(0);
  });

  it("counts a goal with a null sphere only in unassignedGoals", () => {
    const result = buildBalanceWheel([
      { sphere: null, contributionsInWindow: 1, stepsDoneInWindow: 1, checkinsInWindow: 1 },
    ]);
    expect(result.unassignedGoals).toBe(1);
    expect(result.slices.every((s) => s.activeGoals === 0 && s.weekEvents === 0)).toBe(true);
  });

  it("sums contributions, steps and check-ins into a sphere's weekEvents", () => {
    const result = buildBalanceWheel([
      { sphere: "health", contributionsInWindow: 1, stepsDoneInWindow: 2, checkinsInWindow: 3 },
    ]);
    const health = result.slices.find((s) => s.sphere === "health")!;
    expect(health.weekEvents).toBe(6); // pinned literal, not derived from the fixture's summands
    expect(health.activeGoals).toBe(1);
  });

  it("keeps slice order equal to GOAL_SPHERES", () => {
    const result = buildBalanceWheel([]);
    expect(result.slices.map((s) => s.sphere)).toEqual([...GOAL_SPHERES]);
  });

  it("keeps a sphere with a goal but no events at activeGoals=1/weekEvents=0 (the «без движения» case)", () => {
    const result = buildBalanceWheel([
      { sphere: "career", contributionsInWindow: 0, stepsDoneInWindow: 0, checkinsInWindow: 0 },
    ]);
    const career = result.slices.find((s) => s.sphere === "career")!;
    expect(career.activeGoals).toBe(1);
    expect(career.weekEvents).toBe(0);
  });

  it("computes maxWeekEvents as the max weekEvents over all slices", () => {
    const result = buildBalanceWheel([
      { sphere: "health", contributionsInWindow: 2, stepsDoneInWindow: 0, checkinsInWindow: 0 },
      { sphere: "career", contributionsInWindow: 5, stepsDoneInWindow: 0, checkinsInWindow: 0 },
      { sphere: "finance", contributionsInWindow: 1, stepsDoneInWindow: 0, checkinsInWindow: 0 },
    ]);
    expect(result.maxWeekEvents).toBe(5);
  });
});
