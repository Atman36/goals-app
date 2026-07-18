import { describe, expect, it } from "vitest";
import { reflectionInputSchema } from "@/lib/validators/reflection";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    promised: "Бегать 3 раза в неделю",
    done: "Пробежал дважды",
    blocked: "Помешала простуда",
    learned: "Нужно закладывать запасной день",
    promise: "Пробежать 3 раза на этой неделе",
    ...overrides,
  };
}

describe("reflectionInputSchema", () => {
  it("accepts a full valid object", () => {
    const result = reflectionInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects a missing promise", () => {
    const result = reflectionInputSchema.safeParse({
      promised: "Бегать 3 раза в неделю",
      done: "Пробежал дважды",
      blocked: "Помешала простуда",
      learned: "Нужно закладывать запасной день",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string promise", () => {
    const result = reflectionInputSchema.safeParse(validInput({ promise: "" }));
    expect(result.success).toBe(false);
  });

  it("accepts a 1-character promise (lower boundary)", () => {
    const result = reflectionInputSchema.safeParse(validInput({ promise: "a" }));
    expect(result.success).toBe(true);
  });

  it("accepts a promise of exactly 2000 characters", () => {
    const result = reflectionInputSchema.safeParse(validInput({ promise: "a".repeat(2000) }));
    expect(result.success).toBe(true);
  });

  it("rejects a promise of 2001 characters", () => {
    const result = reflectionInputSchema.safeParse(validInput({ promise: "a".repeat(2001) }));
    expect(result.success).toBe(false);
  });

  it("parses an empty-string optional field as undefined", () => {
    const result = reflectionInputSchema.safeParse(validInput({ done: "" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.done).toBeUndefined();
  });

  it.each(["done", "partial", "skipped"] as const)("accepts prevOutcome %s", (prevOutcome) => {
    const result = reflectionInputSchema.safeParse(validInput({ prevOutcome }));
    expect(result.success).toBe(true);
  });

  it("rejects an invalid prevOutcome", () => {
    const result = reflectionInputSchema.safeParse(validInput({ prevOutcome: "maybe" }));
    expect(result.success).toBe(false);
  });
});
