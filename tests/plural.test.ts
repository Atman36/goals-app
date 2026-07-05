import { describe, expect, it } from "vitest";
import { pluralRu } from "@/lib/utils/plural";

describe("pluralRu", () => {
  const form = (n: number) => pluralRu(n, "шаг", "шага", "шагов");

  it("selects the singular form for 1, 21, 31 (but not 11)", () => {
    expect(form(1)).toBe("шаг");
    expect(form(21)).toBe("шаг");
    expect(form(11)).toBe("шагов");
  });

  it("selects the few form for 2–4, 22–24 (but not 12–14)", () => {
    expect(form(2)).toBe("шага");
    expect(form(4)).toBe("шага");
    expect(form(23)).toBe("шага");
    expect(form(12)).toBe("шагов");
  });

  it("selects the many form for 0, 5–20, 25", () => {
    expect(form(0)).toBe("шагов");
    expect(form(5)).toBe("шагов");
    expect(form(15)).toBe("шагов");
    expect(form(25)).toBe("шагов");
  });
});
