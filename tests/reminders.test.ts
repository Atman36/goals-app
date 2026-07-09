import { describe, expect, it } from "vitest";
import { classifyDue, formatDueLabelRu } from "@/lib/utils/reminders";

const TODAY = "2026-07-09";

describe("classifyDue", () => {
  it("returns null when there is no date", () => {
    expect(classifyDue(null, TODAY)).toBeNull();
    expect(classifyDue(undefined, TODAY)).toBeNull();
  });

  it("classifies a past date as overdue", () => {
    expect(classifyDue("2026-07-08", TODAY)).toBe("overdue");
  });

  it("classifies today as today", () => {
    expect(classifyDue("2026-07-09", TODAY)).toBe("today");
  });

  it("classifies a near-future date within the window as soon", () => {
    expect(classifyDue("2026-07-12", TODAY)).toBe("soon"); // +3 days
  });

  it("classifies a far-future date as later", () => {
    expect(classifyDue("2026-08-08", TODAY)).toBe("later"); // +30 days
  });

  it("treats exactly the soon-window boundary as soon, one day past it as later", () => {
    expect(classifyDue("2026-07-16", TODAY)).toBe("soon"); // +7 days
    expect(classifyDue("2026-07-17", TODAY)).toBe("later"); // +8 days
  });
});

describe("formatDueLabelRu", () => {
  it("labels today", () => {
    expect(formatDueLabelRu("2026-07-09", TODAY)).toBe("Сегодня");
  });

  it("labels overdue with the correct Russian plural form", () => {
    expect(formatDueLabelRu("2026-07-08", TODAY)).toBe("Просрочено на 1 день");
    expect(formatDueLabelRu("2026-07-06", TODAY)).toBe("Просрочено на 3 дня");
    expect(formatDueLabelRu("2026-07-04", TODAY)).toBe("Просрочено на 5 дней");
  });

  it("labels a future date with the correct Russian plural form", () => {
    expect(formatDueLabelRu("2026-07-11", TODAY)).toBe("Через 2 дня");
  });

  it("returns an empty string when there is no date", () => {
    expect(formatDueLabelRu(null, TODAY)).toBe("");
  });
});
