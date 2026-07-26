import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T1: after the `/` ⇄ `/goals` move, `/` is the daily loop and `/goals` is
 * the goal list (filters, archive, aggregate money tiles, covers, «Шаги» and
 * «Дедлайны» blocks). Cache revalidation has to track that split by hand —
 * `revalidatePath` calls do not fail a build or a type check if they name a
 * page the mutation can no longer affect, so a missed or misplaced call is
 * silent stale data in the goal list. This file is the only thing that makes
 * that drift fail.
 */

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function occurrences(text: string, literal: string): number {
  return text.split(literal).length - 1;
}

describe("revalidatePath tracks the /goals list", () => {
  it("goals.ts revalidates /goals from exactly its six goal-row-mutating blocks", () => {
    // createGoal, updateGoal, archiveGoal, softDeleteGoalAction, and both of
    // markAchieved's blocks (idempotent early-return + real transition).
    const GOAL_ROW_MUTATING_BLOCKS = 6;

    const goals = source("lib/actions/goals.ts");
    expect(occurrences(goals, 'revalidatePath("/goals")')).toBe(GOAL_ROW_MUTATING_BLOCKS);
  });

  it("media.ts revalidates /goals from registerMedia and setGoalCover", () => {
    const media = source("lib/actions/media.ts");
    expect(occurrences(media, 'revalidatePath("/goals")')).toBe(2);
  });

  it("focus.ts revalidates /goals from setFocusGoal and clearFocusGoal", () => {
    const focus = source("lib/actions/focus.ts");
    expect(occurrences(focus, 'revalidatePath("/goals")')).toBe(2);
  });

  it("plan-adjustments.ts revalidates /goals once, for its checklist rewrite", () => {
    const planAdjustments = source("lib/actions/plan-adjustments.ts");
    expect(occurrences(planAdjustments, 'revalidatePath("/goals")')).toBe(1);
  });

  it("no action revalidates /today: the route is a permanent redirect with nothing to render", () => {
    const actionsDir = join(process.cwd(), "lib/actions");
    const files = readdirSync(actionsDir).filter((name) => name.endsWith(".ts"));

    for (const file of files) {
      const content = source(`lib/actions/${file}`);
      expect(occurrences(content, 'revalidatePath("/today")'), file).toBe(0);
    }
  });

  it("reflections.ts revalidates / — a saved reflection changes the weekly promise", () => {
    const reflections = source("lib/actions/reflections.ts");
    expect(reflections).toContain('revalidatePath("/")');
  });

  it("checkins.ts revalidates / but not /goals — the goal list renders nothing check-in-derived", () => {
    const checkins = source("lib/actions/checkins.ts");
    expect(checkins).toContain('revalidatePath("/")');
    expect(checkins).not.toContain('revalidatePath("/goals")');
  });
});
