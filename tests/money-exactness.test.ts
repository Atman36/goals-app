import { describe, expect, it } from "vitest";
import {
  MAX_INT8,
  MIN_INT8,
  amountMagnitudeBucket,
  calcFinancialProgress,
  parseMajorDecimalToMinor,
} from "@/lib/utils/money";
import { calcRequiredMonthlyPace } from "@/lib/utils/pace";

// MONEY-001 · MONEY-002 (GA-014): every stored or compared amount stays an
// exact bigint minor-unit value. The paths below all used to route the amount
// through a double first — Number(customAmount), Math.round(n * 100),
// Number(remaining) / months, Math.abs(Number(magnitude)) / 100 — so an amount
// past 2^53 was persisted, projected or classified as a different number than
// the one the user entered.

const TWO_53 = 9_007_199_254_740_992n;

describe("parseMajorDecimalToMinor (MONEY-001)", () => {
  it("parses whole and fractional major units exactly", () => {
    expect(parseMajorDecimalToMinor("0")).toBe(0n);
    expect(parseMajorDecimalToMinor("100")).toBe(10_000n);
    expect(parseMajorDecimalToMinor("19.99")).toBe(1_999n);
  });

  it("reads a single decimal place as tenths of a major unit", () => {
    // "19.9" is 19 rubles 90 kopecks, not 19 rubles 9 kopecks.
    expect(parseMajorDecimalToMinor("19.9")).toBe(1_990n);
  });

  it("accepts a comma as the decimal separator (ru-RU keyboards)", () => {
    expect(parseMajorDecimalToMinor("19,99")).toBe(1_999n);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    // Number("90071992547409.93") * 100 does NOT land on this value.
    expect(parseMajorDecimalToMinor("90071992547409.93")).toBe(9_007_199_254_740_993n);
    expect(parseMajorDecimalToMinor("90071992547409.93")).toBeGreaterThan(TWO_53);
  });

  it("round-trips the int8 maximum and rejects one past it", () => {
    const maxMajor = MAX_INT8 / 100n;
    const maxFrac = MAX_INT8 % 100n;
    const atMax = `${maxMajor}.${maxFrac.toString().padStart(2, "0")}`;
    expect(parseMajorDecimalToMinor(atMax)).toBe(MAX_INT8);

    const pastMax = `${maxMajor + 1n}`;
    expect(parseMajorDecimalToMinor(pastMax)).toBeNull();
  });

  it("rejects everything that is not a non-negative 2dp decimal", () => {
    for (const value of ["", " ", "-5", "1.234", "1e3", "abc", "1.", ".5", "9".repeat(100)]) {
      expect(parseMajorDecimalToMinor(value)).toBeNull();
    }
  });
});

describe("amountMagnitudeBucket (MONEY-002)", () => {
  it("buckets by bigint comparison, at the documented boundaries", () => {
    expect(amountMagnitudeBucket(99_999n)).toBe("<1k"); // 999.99
    expect(amountMagnitudeBucket(100_000n)).toBe("1k-10k"); // 1000.00
    expect(amountMagnitudeBucket(1_000_000n)).toBe("1k-10k"); // 10 000.00
    expect(amountMagnitudeBucket(1_000_100n)).toBe(">10k"); // 10 001.00
  });

  it("uses magnitude, so a withdrawal buckets like the deposit of the same size", () => {
    expect(amountMagnitudeBucket(-500_000n)).toBe(amountMagnitudeBucket(500_000n));
  });

  it("classifies int8 extremes without a Number hop", () => {
    expect(amountMagnitudeBucket(MAX_INT8)).toBe(">10k");
    expect(amountMagnitudeBucket(MIN_INT8 + 1n)).toBe(">10k");
  });
});

describe("calcRequiredMonthlyPace exactness (MONEY-001)", () => {
  const FROM = new Date("2026-01-01T00:00:00.000Z");
  const DEADLINE_2_MONTHS = new Date(FROM.getTime() + 2 * 30.44 * 24 * 60 * 60 * 1000);

  it("projects from the exact remaining amount past Number.MAX_SAFE_INTEGER", () => {
    // remaining = 2^53 + 1 over 2 months. Number(remaining) rounds that back
    // down to 2^53, so the old path projected the wrong figure.
    const target = TWO_53 + 1n;
    const pace = calcRequiredMonthlyPace(target, 0n, DEADLINE_2_MONTHS, FROM);
    expect(pace).not.toBeNull();
    // Ceiling of an exact halving: (2^53 + 1) / 2 → 2^52 + 1.
    expect(pace).toBe(TWO_53 / 2n + 1n);
  });

  it("still returns 0n at exactly the target and null past the deadline", () => {
    expect(calcRequiredMonthlyPace(MAX_INT8, MAX_INT8, DEADLINE_2_MONTHS, FROM)).toBe(0n);
    expect(calcRequiredMonthlyPace(MAX_INT8, 0n, FROM, FROM)).toBeNull();
  });
});

describe("calcFinancialProgress at the target boundary (MONEY-002)", () => {
  it("is 100% only when saved has actually reached the target", () => {
    expect(calcFinancialProgress(MAX_INT8 - 1n, MAX_INT8)).toBeLessThan(1);
    expect(calcFinancialProgress(MAX_INT8, MAX_INT8)).toBe(1);
    expect(calcFinancialProgress(MAX_INT8, MAX_INT8 - 1n)).toBe(1);
  });
});
