import { describe, expect, it } from "vitest";
import { woopInputSchema } from "@/lib/validators/woop";

describe("woopInputSchema", () => {
  it("accepts a valid input", () => {
    const result = woopInputSchema.safeParse({
      wish: "Пробежать марафон",
      outcome: "Почувствую гордость и уверенность",
      obstacle: "Лень вставать рано утром",
      plan: "Если прозвенит будильник → то я сразу встаю",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string field", () => {
    const result = woopInputSchema.safeParse({
      wish: "",
      outcome: "Каким будет лучший исход",
      obstacle: "Что-то мешает",
      plan: "План",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a wish longer than 120 characters", () => {
    const result = woopInputSchema.safeParse({
      wish: "a".repeat(121),
      outcome: "Каким будет лучший исход",
      obstacle: "Что-то мешает",
      plan: "План",
    });
    expect(result.success).toBe(false);
  });
});
