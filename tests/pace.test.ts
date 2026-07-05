import { describe, expect, it } from "vitest";
import {
  calcRequiredMonthlyPace,
  calcRequiredWeeklyItemPace,
  calcTrailingMonthlyPace,
  comparePace,
} from "@/lib/utils/pace";

// Exactly 2 average months (2 * 30.44 days) between `from` and `deadline`.
const FROM = new Date("2026-01-01T00:00:00.000Z");
const DEADLINE_2_MONTHS = new Date(FROM.getTime() + 2 * 30.44 * 24 * 60 * 60 * 1000);

describe("calcRequiredMonthlyPace", () => {
  it("matches a hand-computed example: (target - saved) / months", () => {
    // remaining = 100000 - 40000 = 60000 minor units over 2 months → 30000/month.
    const pace = calcRequiredMonthlyPace(100000n, 40000n, DEADLINE_2_MONTHS, FROM);
    expect(pace).toBe(30000n);
  });

  it("returns null once the deadline has passed (zero-months-left guard)", () => {
    expect(calcRequiredMonthlyPace(100000n, 0n, FROM, FROM)).toBeNull();
    const pastDeadline = new Date(FROM.getTime() - 1000);
    expect(calcRequiredMonthlyPace(100000n, 0n, pastDeadline, FROM)).toBeNull();
  });

  it("returns 0n once the target is already met", () => {
    expect(calcRequiredMonthlyPace(1000n, 1500n, DEADLINE_2_MONTHS, FROM)).toBe(0n);
  });
});

describe("calcRequiredWeeklyItemPace", () => {
  it("matches a hand-computed example for non-financial goals", () => {
    // 5 remaining items over ~8.697 weeks → ceil(5.749..., rounded to 1dp) = 0.6/week.
    const pace = calcRequiredWeeklyItemPace(5, DEADLINE_2_MONTHS, FROM);
    expect(pace).toBe(0.6);
  });

  it("returns null once the deadline has passed (zero-weeks-left guard)", () => {
    expect(calcRequiredWeeklyItemPace(5, FROM, FROM)).toBeNull();
  });

  it("returns 0 once all items are done", () => {
    expect(calcRequiredWeeklyItemPace(0, DEADLINE_2_MONTHS, FROM)).toBe(0);
  });
});

describe("comparePace", () => {
  it("reports on_track when actual pace matches required pace", () => {
    expect(comparePace(100, 100)).toBe("on_track");
  });

  it("reports ahead when actual pace exceeds required pace beyond tolerance", () => {
    expect(comparePace(100, 115)).toBe("ahead");
  });

  it("reports behind when actual pace trails required pace beyond tolerance", () => {
    expect(comparePace(100, 85)).toBe("behind");
  });
});

describe("calcTrailingMonthlyPace", () => {
  const NOW = new Date("2026-04-01T00:00:00.000Z");

  it("averages in-window signed contributions over the window length", () => {
    // 30000 + 30000 within the last 3 months → 60000 / 3 = 20000/month.
    const pace = calcTrailingMonthlyPace(
      [
        { amount: 30000n, occurredAt: "2026-03-15" },
        { amount: 30000n, occurredAt: "2026-02-10" },
      ],
      NOW,
    );
    expect(pace).toBe(20000n);
  });

  it("ignores contributions older than the window", () => {
    const pace = calcTrailingMonthlyPace(
      [
        { amount: 9000n, occurredAt: "2026-03-20" },
        { amount: 999999n, occurredAt: "2025-01-01" },
      ],
      NOW,
    );
    expect(pace).toBe(3000n);
  });

  it("nets withdrawals and floors at zero", () => {
    const pace = calcTrailingMonthlyPace(
      [
        { amount: 3000n, occurredAt: "2026-03-20" },
        { amount: -9000n, occurredAt: "2026-03-21" },
      ],
      NOW,
    );
    expect(pace).toBe(0n);
  });
});
