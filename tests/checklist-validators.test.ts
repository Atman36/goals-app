import { describe, expect, it } from "vitest";
import { checklistPostBodySchema } from "@/lib/validators/checklist";

describe("checklistPostBodySchema", () => {
  it("accepts an if_then kind with a valid ifThen plan", () => {
    const result = checklistPostBodySchema.safeParse({
      title: "Не срываться на сладкое",
      kind: "if_then",
      ifThen: {
        trigger: "если чувствую стресс на работе",
        action: "выпить стакан воды и пройтись 5 минут",
        planType: "relapse_prevention",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an if_then kind without an ifThen plan", () => {
    const result = checklistPostBodySchema.safeParse({
      title: "План без деталей",
      kind: "if_then",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a plain kind that includes an ifThen plan", () => {
    const result = checklistPostBodySchema.safeParse({
      title: "Обычный шаг",
      kind: "action",
      ifThen: {
        trigger: "если чувствую стресс",
        action: "сделать паузу",
        planType: "initiation",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid planType", () => {
    const result = checklistPostBodySchema.safeParse({
      title: "План с плохим типом",
      kind: "if_then",
      ifThen: {
        trigger: "если чувствую стресс",
        action: "сделать паузу",
        planType: "not_a_real_type",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plain kind without a kind field (defaults handled downstream)", () => {
    const result = checklistPostBodySchema.safeParse({ title: "Обычный шаг" });
    expect(result.success).toBe(true);
  });
});
