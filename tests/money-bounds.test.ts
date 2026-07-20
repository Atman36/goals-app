import { describe, expect, it } from "vitest";
import {
  MAX_INT8,
  MIN_INT8,
  calcFinancialProgress,
  isInt8IntegerString,
  isInt8NonNegativeIntegerString,
  isWithinInt8,
  parseMajorAmountToMinor,
  toMajorUnits,
  toMajorUnitsString,
} from "@/lib/utils/money";
import { contributionPostBodySchema, contributionSchema } from "@/lib/validators/contribution";
import { goalSchema } from "@/lib/validators/goal";

describe("int8 bounds (CR-013)", () => {
  it("matches the PostgreSQL bigint range", () => {
    expect(MAX_INT8).toBe(9_223_372_036_854_775_807n);
    expect(MIN_INT8).toBe(-9_223_372_036_854_775_808n);
  });

  it("accepts the exact boundaries and rejects one past them", () => {
    expect(isWithinInt8(MAX_INT8)).toBe(true);
    expect(isWithinInt8(MIN_INT8)).toBe(true);
    expect(isWithinInt8(MAX_INT8 + 1n)).toBe(false);
    expect(isWithinInt8(MIN_INT8 - 1n)).toBe(false);
  });
});

describe("isInt8IntegerString", () => {
  it("accepts in-range integer strings, including the boundaries", () => {
    expect(isInt8IntegerString("0")).toBe(true);
    expect(isInt8IntegerString("9223372036854775807")).toBe(true);
    expect(isInt8IntegerString("-9223372036854775808")).toBe(true);
  });

  it("rejects one past each boundary", () => {
    expect(isInt8IntegerString("9223372036854775808")).toBe(false);
    expect(isInt8IntegerString("-9223372036854775809")).toBe(false);
  });

  it("never throws on non-numeric or absurdly long input", () => {
    expect(() => isInt8IntegerString("abc")).not.toThrow();
    expect(isInt8IntegerString("abc")).toBe(false);
    expect(isInt8IntegerString("")).toBe(false);
    expect(isInt8IntegerString("1.5")).toBe(false);
    expect(isInt8IntegerString(" 1")).toBe(false);
    expect(isInt8IntegerString("1e30")).toBe(false);
    expect(isInt8IntegerString("9".repeat(5000))).toBe(false);
  });

  it("rejects a leading sign for the non-negative variant", () => {
    expect(isInt8NonNegativeIntegerString("-1")).toBe(false);
    expect(isInt8NonNegativeIntegerString("1")).toBe(true);
  });
});

describe("contributionPostBodySchema.amountMinor (CR-013)", () => {
  const base = {
    id: "3f1d1d24-1f4c-4a0d-9f8e-9a6b3c2d1e0f",
    // Date-only key, not a datetime: GA-018 made the datetime form invalid.
    occurredAt: "2026-07-20",
  };

  it("accepts the int8 maximum", () => {
    const parsed = contributionPostBodySchema.safeParse({
      ...base,
      amountMinor: "9223372036854775807",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects one past the int8 maximum with a validation error, not a throw", () => {
    const parsed = contributionPostBodySchema.safeParse({
      ...base,
      amountMinor: "9223372036854775808",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a long digit string instead of letting it reach the driver", () => {
    // This is the CR-013 reproduction: /^\d+$/ alone accepted it, BigInt()
    // happily built it, and the INSERT then failed with an HTTP 500.
    const parsed = contributionPostBodySchema.safeParse({
      ...base,
      amountMinor: "9".repeat(100),
    });
    expect(parsed.success).toBe(false);
  });

  it("still rejects non-digit input without throwing", () => {
    expect(() =>
      contributionPostBodySchema.safeParse({ ...base, amountMinor: "not-a-number" }),
    ).not.toThrow();
    expect(
      contributionPostBodySchema.safeParse({ ...base, amountMinor: "not-a-number" }).success,
    ).toBe(false);
  });
});

describe("contributionSchema.amount range", () => {
  const base = {
    id: "3f1d1d24-1f4c-4a0d-9f8e-9a6b3c2d1e0f",
    goalId: "8c2a5b31-77d4-4f2a-9c1e-2b6d4e8f0a13",
    occurredAt: "2026-07-20",
  };

  it("accepts an in-range amount", () => {
    expect(contributionSchema.safeParse({ ...base, amount: MAX_INT8 }).success).toBe(true);
  });

  it("rejects an out-of-range amount", () => {
    expect(contributionSchema.safeParse({ ...base, amount: MAX_INT8 + 1n }).success).toBe(false);
  });

  it("still rejects a zero amount", () => {
    expect(contributionSchema.safeParse({ ...base, amount: 0n }).success).toBe(false);
  });
});

describe("goalSchema amount range (CR-013)", () => {
  const base = {
    kind: "financial" as const,
    title: "Новая цель",
    deadline: "2027-01-01",
    currency: "RUB" as const,
  };

  it("accepts an in-range target", () => {
    expect(goalSchema.safeParse({ ...base, targetAmount: 10_000_000n }).success).toBe(true);
  });

  it("rejects a target past int8", () => {
    expect(goalSchema.safeParse({ ...base, targetAmount: MAX_INT8 + 1n }).success).toBe(false);
  });

  it("rejects an initial amount past int8", () => {
    const parsed = goalSchema.safeParse({
      ...base,
      targetAmount: 1_000n,
      initialAmount: MAX_INT8 + 1n,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("parseMajorAmountToMinor (exact major → minor, CR-012/CR-013)", () => {
  it("converts without a Number round-trip", () => {
    expect(parseMajorAmountToMinor("100")).toBe(10_000n);
    expect(parseMajorAmountToMinor("0")).toBe(0n);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    // 90_071_992_547_409n major units is beyond a double's integer precision
    // once multiplied by 100; bigint math must land on the exact value.
    expect(parseMajorAmountToMinor("90071992547409")).toBe(9_007_199_254_740_900n);
  });

  it("rejects an amount whose minor-unit value would overflow int8", () => {
    // 100x is applied before the range check, so the major-unit cap is MAX/100.
    const maxMajor = MAX_INT8 / 100n;
    expect(parseMajorAmountToMinor(maxMajor.toString())).toBe(maxMajor * 100n);
    expect(parseMajorAmountToMinor((maxMajor + 1n).toString())).toBeNull();
  });

  it("rejects malformed and oversized input instead of throwing", () => {
    expect(parseMajorAmountToMinor("")).toBeNull();
    expect(parseMajorAmountToMinor("-5")).toBeNull();
    expect(parseMajorAmountToMinor("1.5")).toBeNull();
    expect(parseMajorAmountToMinor("abc")).toBeNull();
    expect(parseMajorAmountToMinor("9".repeat(1000))).toBeNull();
  });

  it("tolerates surrounding whitespace, matching the old trim behaviour", () => {
    expect(parseMajorAmountToMinor("  42  ")).toBe(4_200n);
  });
});

describe("toMajorUnitsString (exact bigint → decimal string, CR-012)", () => {
  it("renders whole and fractional amounts exactly", () => {
    expect(toMajorUnitsString(10_000n)).toBe("100");
    expect(toMajorUnitsString(1_999n)).toBe("19.99");
    expect(toMajorUnitsString(5n)).toBe("0.05");
    expect(toMajorUnitsString(0n)).toBe("0");
  });

  it("handles negative amounts (withdrawals)", () => {
    expect(toMajorUnitsString(-1_999n)).toBe("-19.99");
    expect(toMajorUnitsString(-5n)).toBe("-0.05");
  });

  it("is exact for values a double cannot represent", () => {
    expect(toMajorUnitsString(MAX_INT8)).toBe("92233720368547758.07");
  });

  it("agrees with toMajorUnits on every safely-representable value", () => {
    for (const minor of [0n, 1n, 5n, 99n, 100n, 1_999n, 10_000n, -1_999n, 123_456_789n]) {
      expect(toMajorUnits(minor)).toBe(Number(minor) / 100);
    }
  });
});

describe("calcFinancialProgress never reports a false 100%", () => {
  it("reports 99%, not 100%, one kopeck short of a 100 000 ₽ target", () => {
    // The reported bug: Math.round(0.9999999 * 100) === 100.
    const progress = calcFinancialProgress(9_999_999n, 10_000_000n);
    expect(progress).toBeLessThan(1);
    expect(Math.round(progress * 100)).toBe(99);
  });

  it("reports 99% at every near-miss magnitude", () => {
    for (const target of [100n, 10_000n, 10_000_000n, 1_000_000_000_000n]) {
      const progress = calcFinancialProgress(target - 1n, target);
      expect(Math.round(progress * 100)).toBe(99);
    }
  });

  it("reports 100% only once the target is genuinely met", () => {
    expect(calcFinancialProgress(10_000_000n, 10_000_000n)).toBe(1);
    expect(calcFinancialProgress(10_000_001n, 10_000_000n)).toBe(1);
  });

  it("keeps exact partial ratios at whole-percent resolution", () => {
    expect(calcFinancialProgress(250n, 1_000n)).toBe(0.25);
    expect(calcFinancialProgress(1n, 1_000n)).toBe(0);
    expect(calcFinancialProgress(10n, 1_000n)).toBe(0.01);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    const target = 9_007_199_254_740_993n;
    expect(calcFinancialProgress(target - 1n, target)).toBeLessThan(1);
    expect(Math.round(calcFinancialProgress(target - 1n, target) * 100)).toBe(99);
    expect(calcFinancialProgress(target, target)).toBe(1);
  });

  it("clamps out-of-range inputs as before", () => {
    expect(calcFinancialProgress(-100n, 1_000n)).toBe(0);
    expect(calcFinancialProgress(2_000n, 1_000n)).toBe(1);
    expect(calcFinancialProgress(500n, 0n)).toBe(0);
    expect(calcFinancialProgress(500n, -1n)).toBe(0);
  });
});
