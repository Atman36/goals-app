import { describe, expect, it } from "vitest";
import { dateKeySchema, isCalendarDateKey } from "@/lib/validators/date-key";
import { checklistItemSchema, checklistPostBodySchema } from "@/lib/validators/checklist";
import { contributionPostBodySchema, contributionSchema } from "@/lib/validators/contribution";
import { goalSchema } from "@/lib/validators/goal";

// DATE-001 (GA-018 / CR-023): a date-only field accepts a real calendar date
// written exactly as YYYY-MM-DD, and never normalizes anything else into a
// different day. Table-driven, because the defect was that the *rejected* set
// was empty — every one of these used to be silently accepted and re-keyed.

const VALID: [string, string][] = [
  ["a leap day in a leap year", "2024-02-29"],
  ["a century leap year", "2000-02-29"],
  ["a 31-day month end", "2026-01-31"],
  ["a 30-day month end", "2026-04-30"],
  ["the last day of a year", "2026-12-31"],
  ["the first day of a year", "2026-01-01"],
];

const INVALID: [string, string][] = [
  ["February 31st", "2026-02-31"],
  ["a leap day in a non-leap year", "2026-02-29"],
  ["a leap day in a non-leap century", "1900-02-29"],
  ["April 31st", "2026-04-31"],
  ["month 13", "2026-13-01"],
  ["month 00", "2026-00-10"],
  ["day 00", "2026-05-00"],
  ["a datetime", "2026-06-01T00:00:00.000Z"],
  ["a datetime with a positive offset", "2026-06-01T00:00:00+05:00"],
  ["a bare date with trailing whitespace", "2026-06-01 "],
  ["a bare date with leading whitespace", " 2026-06-01"],
  ["an unpadded month", "2026-6-01"],
  ["an unpadded day", "2026-06-1"],
  ["a ru-RU locale form", "01.06.2026"],
  ["a US locale form", "06/01/2026"],
  ["a two-digit year", "26-06-01"],
  ["an empty string", ""],
  ["a non-date", "не дата"],
];

describe("isCalendarDateKey (DATE-001)", () => {
  it.each(VALID)("accepts %s", (_label, value) => {
    expect(isCalendarDateKey(value)).toBe(true);
  });

  it.each(INVALID)("rejects %s", (_label, value) => {
    expect(isCalendarDateKey(value)).toBe(false);
  });

  it("never throws on adversarial input", () => {
    for (const value of ["9999-99-99", "0000-00-00", "9".repeat(500), "----"]) {
      expect(() => isCalendarDateKey(value)).not.toThrow();
      expect(isCalendarDateKey(value)).toBe(false);
    }
  });
});

describe("dateKeySchema round trip (DATE-001)", () => {
  it("returns the identical string it was given", () => {
    const parsed = dateKeySchema.safeParse("2024-02-29");
    expect(parsed.success && parsed.data).toBe("2024-02-29");
  });

  it("normalizes no impossible date into another day", () => {
    // The whole point of GA-018: z.coerce.date() turned this into 2026-03-03.
    expect(dateKeySchema.safeParse("2026-02-31").success).toBe(false);
  });

  it("rejects a non-string without coercing it", () => {
    expect(dateKeySchema.safeParse(new Date("2026-06-01")).success).toBe(false);
    expect(dateKeySchema.safeParse(1_780_000_000_000).success).toBe(false);
  });
});

describe("every date-only field on both write paths shares the schema (DATE-001)", () => {
  const goalBase = { kind: "financial" as const, title: "Цель", currency: "RUB" as const, targetAmount: 1_000n };
  const checklistBase = { goalId: "8c2a5b31-77d4-4f2a-9c1e-2b6d4e8f0a13", title: "Шаг" };
  const contributionBase = {
    id: "3f1d1d24-1f4c-4a0d-9f8e-9a6b3c2d1e0f",
    goalId: "8c2a5b31-77d4-4f2a-9c1e-2b6d4e8f0a13",
    amount: 1_000n,
  };

  it("goalSchema.deadline", () => {
    expect(goalSchema.safeParse({ ...goalBase, deadline: "2024-02-29" }).success).toBe(true);
    expect(goalSchema.safeParse({ ...goalBase, deadline: "2026-02-31" }).success).toBe(false);
  });

  it("checklistItemSchema.dueDate (Server Action path)", () => {
    expect(checklistItemSchema.safeParse({ ...checklistBase, dueDate: "2024-02-29" }).success).toBe(true);
    expect(checklistItemSchema.safeParse({ ...checklistBase, dueDate: "2026-02-31" }).success).toBe(false);
    // Still optional — an item with no due date remains valid.
    expect(checklistItemSchema.safeParse(checklistBase).success).toBe(true);
  });

  it("checklistPostBodySchema.dueDate (/api/v1 path)", () => {
    expect(checklistPostBodySchema.safeParse({ title: "Шаг", dueDate: "2024-02-29" }).success).toBe(true);
    expect(checklistPostBodySchema.safeParse({ title: "Шаг", dueDate: "2026-02-31" }).success).toBe(false);
  });

  it("contributionSchema.occurredAt (Server Action path)", () => {
    expect(contributionSchema.safeParse({ ...contributionBase, occurredAt: "2024-02-29" }).success).toBe(true);
    expect(contributionSchema.safeParse({ ...contributionBase, occurredAt: "2026-02-31" }).success).toBe(false);
  });

  it("contributionPostBodySchema.occurredAt (/api/v1 path)", () => {
    const base = { id: contributionBase.id, amountMinor: "1000" };
    expect(contributionPostBodySchema.safeParse({ ...base, occurredAt: "2024-02-29" }).success).toBe(true);
    expect(contributionPostBodySchema.safeParse({ ...base, occurredAt: "2026-02-31" }).success).toBe(false);
    // The offset form the audit called out: it used to shift the stored day.
    expect(
      contributionPostBodySchema.safeParse({ ...base, occurredAt: "2026-06-01T00:00:00+05:00" }).success,
    ).toBe(false);
  });
});
