import { describe, expect, it } from "vitest";
import { computeStreakWeeks } from "@/lib/utils/streak";

// Consecutive Mondays, most recent first.
const W0 = "2026-07-06";
const W1 = "2026-06-29";
const W2 = "2026-06-22";
const W3 = "2026-06-15";

describe("computeStreakWeeks", () => {
  it("returns 0 for no activity", () => {
    expect(computeStreakWeeks(new Set(), W0)).toBe(0);
  });

  it("counts the current week plus consecutive prior weeks", () => {
    expect(computeStreakWeeks(new Set([W0, W1, W2]), W0)).toBe(3);
  });

  it("stops at the first gap", () => {
    // W3 is active but W2 is missing → only W0 and W1 count.
    expect(computeStreakWeeks(new Set([W0, W1, W3]), W0)).toBe(2);
  });

  it("gives an in-progress current week grace: counts from last week", () => {
    // Current week W0 has no activity yet, but W1 and W2 do.
    expect(computeStreakWeeks(new Set([W1, W2]), W0)).toBe(2);
  });

  it("returns 0 when neither the current nor the previous week is active", () => {
    // Last activity was two weeks ago — the streak has already lapsed.
    expect(computeStreakWeeks(new Set([W2, W3]), W0)).toBe(0);
  });

  it("counts a single active current week", () => {
    expect(computeStreakWeeks(new Set([W0]), W0)).toBe(1);
  });

  it("counts a single active previous week under grace", () => {
    expect(computeStreakWeeks(new Set([W1]), W0)).toBe(1);
  });
});
