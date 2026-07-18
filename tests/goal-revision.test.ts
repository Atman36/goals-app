import { describe, expect, it } from "vitest";
import { diffGoalContent } from "@/lib/utils/goal-revision";

describe("diffGoalContent", () => {
  it("returns [] when no content field changed", () => {
    expect(
      diffGoalContent(
        { title: "Накопить", description: "заметка", deadline: "2026-01-01" },
        { title: "Накопить", description: "заметка", deadline: "2026-01-01" },
      ),
    ).toEqual([]);
  });

  it("detects a title-only change", () => {
    expect(
      diffGoalContent(
        { title: "Старое", description: "заметка", deadline: "2026-01-01" },
        { title: "Новое", description: "заметка", deadline: "2026-01-01" },
      ),
    ).toEqual(["title"]);
  });

  it("treats null and empty-string description as equal (no change)", () => {
    expect(
      diffGoalContent(
        { title: "Накопить", description: null, deadline: "2026-01-01" },
        { title: "Накопить", description: "", deadline: "2026-01-01" },
      ),
    ).toEqual([]);
  });

  it("compares deadline as date-key strings", () => {
    expect(
      diffGoalContent(
        { title: "Накопить", description: null, deadline: "2026-01-01" },
        { title: "Накопить", description: null, deadline: "2026-02-01" },
      ),
    ).toEqual(["deadline"]);
  });

  it("lists every changed field in stable order (title → description → deadline)", () => {
    expect(
      diffGoalContent(
        { title: "Старое", description: "было", deadline: "2026-01-01" },
        { title: "Новое", description: "стало", deadline: "2026-02-01" },
      ),
    ).toEqual(["title", "description", "deadline"]);
  });
});
