import { describe, expect, it } from "vitest";
import { isExternallyDriven } from "@/lib/utils/concordance";

describe("isExternallyDriven", () => {
  it("is true when guilt + externalPressure exceeds interest + values", () => {
    expect(
      isExternallyDriven({ interest: 1, values: 1, guilt: 5, externalPressure: 5 }),
    ).toBe(true);
  });

  it("is false when the two sides are equal", () => {
    expect(
      isExternallyDriven({ interest: 3, values: 2, guilt: 2, externalPressure: 3 }),
    ).toBe(false);
  });

  it("is false when guilt + externalPressure is lower than interest + values", () => {
    expect(
      isExternallyDriven({ interest: 5, values: 5, guilt: 1, externalPressure: 1 }),
    ).toBe(false);
  });
});
