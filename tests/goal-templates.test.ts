import { describe, expect, it } from "vitest";
import { GOAL_TEMPLATES, getTemplate } from "@/lib/goal-templates";

const VALID_KINDS = new Set(["financial", "non_financial"]);
const VALID_CHECKLIST_KINDS = new Set(["action", "document", "purchase", "agreement", "if_then"]);
const VALID_PLAN_TYPES = new Set(["initiation", "maintenance", "relapse_prevention"]);
const EXPECTED_SLUGS = ["vacation", "safety-cushion", "purchase", "health"];

describe("GOAL_TEMPLATES", () => {
  it("has exactly 4 templates", () => {
    expect(GOAL_TEMPLATES).toHaveLength(4);
  });

  it("has the 4 expected, unique slugs", () => {
    const slugs = GOAL_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it("only uses valid goal kinds", () => {
    for (const template of GOAL_TEMPLATES) {
      expect(VALID_KINDS.has(template.kind)).toBe(true);
    }
  });

  it("makes health non_financial and the other three financial", () => {
    for (const template of GOAL_TEMPLATES) {
      if (template.slug === "health") {
        expect(template.kind).toBe("non_financial");
      } else {
        expect(template.kind).toBe("financial");
      }
    }
  });

  it("uses only allowed starter-checklist item kinds", () => {
    for (const template of GOAL_TEMPLATES) {
      for (const item of template.starterChecklist) {
        expect(VALID_CHECKLIST_KINDS.has(item.kind)).toBe(true);
      }
    }
  });

  it("includes a valid ifThen plan for every if_then starter item", () => {
    for (const template of GOAL_TEMPLATES) {
      for (const item of template.starterChecklist) {
        if (item.kind !== "if_then") continue;
        expect(item.ifThen).toBeDefined();
        expect(item.ifThen?.trigger).toBeTruthy();
        expect(item.ifThen?.action).toBeTruthy();
        expect(VALID_PLAN_TYPES.has(item.ifThen?.planType ?? "")).toBe(true);
      }
    }
  });

  it("has a positive deadline offset for every template", () => {
    for (const template of GOAL_TEMPLATES) {
      expect(template.deadlineOffsetDays).toBeGreaterThan(0);
    }
  });
});

describe("getTemplate", () => {
  it("returns the vacation template for 'vacation'", () => {
    const template = getTemplate("vacation");
    expect(template?.slug).toBe("vacation");
    expect(template?.label).toBe("Отпуск");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getTemplate("nope")).toBeUndefined();
  });
});
