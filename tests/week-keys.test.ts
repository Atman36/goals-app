import { describe, expect, it } from "vitest";
import { previousWeekKey, weekStartKey } from "@/lib/utils/week-keys";

describe("weekStartKey", () => {
  it("returns the Monday of the week for a mid-week date", () => {
    // 2026-07-09 is a Thursday → Monday 2026-07-06
    expect(weekStartKey("2026-07-09")).toBe("2026-07-06");
  });

  it("returns the same day when the date is already a Monday", () => {
    expect(weekStartKey("2026-07-06")).toBe("2026-07-06");
  });

  it("anchors Sunday to the preceding Monday (ISO week)", () => {
    // 2026-07-05 is a Sunday → Monday 2026-06-29
    expect(weekStartKey("2026-07-05")).toBe("2026-06-29");
  });

  it("crosses a month boundary correctly", () => {
    // 2026-07-01 is a Wednesday → Monday 2026-06-29
    expect(weekStartKey("2026-07-01")).toBe("2026-06-29");
  });
});

describe("previousWeekKey", () => {
  it("steps back exactly one week", () => {
    expect(previousWeekKey("2026-07-06")).toBe("2026-06-29");
  });

  it("steps back across a month boundary", () => {
    expect(previousWeekKey("2026-06-29")).toBe("2026-06-22");
  });
});
