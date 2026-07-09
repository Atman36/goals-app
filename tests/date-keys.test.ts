import { describe, expect, it } from "vitest";
import { daysBetweenKeys, toDateKey, todayKey } from "@/lib/utils/date-keys";

describe("toDateKey", () => {
  it("converts a UTC instant to its calendar-date key", () => {
    expect(toDateKey(new Date("2026-07-09T10:00:00Z"))).toBe("2026-07-09");
  });
});

describe("todayKey", () => {
  it("uses the injected clock and stays on the same UTC calendar day near midnight", () => {
    expect(todayKey(new Date("2026-07-09T23:59:00Z"))).toBe("2026-07-09");
  });
});

describe("daysBetweenKeys", () => {
  it("counts forward whole days as positive", () => {
    expect(daysBetweenKeys("2026-07-09", "2026-07-16")).toBe(7);
  });

  it("counts backward whole days as negative", () => {
    expect(daysBetweenKeys("2026-07-16", "2026-07-09")).toBe(-7);
  });

  it("returns 0 for the same day", () => {
    expect(daysBetweenKeys("2026-07-09", "2026-07-09")).toBe(0);
  });

  it("handles a month boundary correctly", () => {
    expect(daysBetweenKeys("2026-07-31", "2026-08-01")).toBe(1);
  });
});
