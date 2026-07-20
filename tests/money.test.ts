import { describe, expect, it } from "vitest";
import {
  calcFinancialProgress,
  calcSaved,
  formatMoney,
  parseMajorDecimalToMinor,
  toMajorUnits,
} from "@/lib/utils/money";

// GA-014: toMinorUnits(number) is gone — the major→minor direction now starts
// from the string the user actually typed, so these round-trips assert the
// exact path rather than the float one.
describe("parseMajorDecimalToMinor / toMajorUnits round-trip", () => {
  it("round-trips whole rubles", () => {
    expect(parseMajorDecimalToMinor("100")).toBe(10000n);
    expect(toMajorUnits(10000n)).toBe(100);
  });

  it("round-trips kopecks", () => {
    expect(parseMajorDecimalToMinor("19.99")).toBe(1999n);
    expect(toMajorUnits(1999n)).toBe(19.99);
  });
});

describe("formatMoney", () => {
  it("formats RUB with the ruble sign and no fractional digits", () => {
    const formatted = formatMoney(150000n, "RUB");
    expect(formatted).toContain("₽");
    expect(formatted.replace(/\D/g, "")).toBe("1500");
  });

  it("formats USD with the dollar sign, rounded to whole units", () => {
    const formatted = formatMoney(1999n, "USD");
    expect(formatted).toContain("$");
    expect(formatted.replace(/\D/g, "")).toBe("20");
  });
});

describe("calcSaved", () => {
  it("sums initial amount with contributions", () => {
    expect(calcSaved(1000n, [500n, 250n])).toBe(1750n);
  });

  it("accounts for negative contributions (withdrawals)", () => {
    expect(calcSaved(1000n, [500n, -300n])).toBe(1200n);
  });

  it("keeps exact precision for bigint sums beyond Number.MAX_SAFE_INTEGER", () => {
    // 9_007_199_254_740_993n (MAX_SAFE_INTEGER + 2) is not exactly representable
    // as a JS number — bigint arithmetic must not go through Number and lose it.
    const initial = 9_007_199_254_740_993n;
    expect(calcSaved(initial, [1n, 1n])).toBe(9_007_199_254_740_995n);
  });
});

describe("calcFinancialProgress", () => {
  it("clamps at 0 when saved is negative relative to target", () => {
    expect(calcFinancialProgress(-100n, 1000n)).toBe(0);
  });

  it("clamps at 1 when saved exceeds target", () => {
    expect(calcFinancialProgress(2000n, 1000n)).toBe(1);
  });

  it("computes a partial ratio", () => {
    expect(calcFinancialProgress(250n, 1000n)).toBe(0.25);
  });

  it("returns 0 when targetAmount is zero or negative", () => {
    expect(calcFinancialProgress(500n, 0n)).toBe(0);
  });

  it("does not throw for bigint amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const saved = 9_007_199_254_740_993n;
    const target = 9_007_199_254_740_993n;
    expect(() => calcFinancialProgress(saved, target)).not.toThrow();
    expect(calcFinancialProgress(saved, target)).toBe(1);
  });
});
