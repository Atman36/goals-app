import { describe, expect, it } from "vitest";
import {
  GOAL_STATUSES,
  canTransitionGoalStatus,
  goalStatusSourcesFor,
  type GoalStatus,
} from "@/lib/validators/goal";

// CR-020: setGoalStatus used to be an unconditional UPDATE that also hardcoded
// `achievedAt: status === "achieved" ? new Date() : null`, so archiving an
// already-achieved goal silently wiped the date it was achieved. The matrix
// below is the single source of truth the query guard and the UI both read.

const LEGAL: ReadonlyArray<[GoalStatus, GoalStatus]> = [
  ["active", "achieved"],
  ["active", "archived"],
  ["achieved", "archived"],
  ["archived", "active"],
];

describe("goal status transition matrix", () => {
  it.each(LEGAL)("allows %s → %s", (from, to) => {
    expect(canTransitionGoalStatus(from, to)).toBe(true);
  });

  it("rejects every transition not in the matrix", () => {
    const legal = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of GOAL_STATUSES) {
      for (const to of GOAL_STATUSES) {
        if (legal.has(`${from}->${to}`)) continue;
        expect(canTransitionGoalStatus(from, to)).toBe(false);
      }
    }
  });

  it("rejects marking an archived goal achieved (revive it first)", () => {
    expect(canTransitionGoalStatus("archived", "achieved")).toBe(false);
  });

  it("rejects un-achieving a goal", () => {
    expect(canTransitionGoalStatus("achieved", "active")).toBe(false);
  });

  it("treats a same-status move as a no-op, not a transition", () => {
    for (const status of GOAL_STATUSES) {
      expect(canTransitionGoalStatus(status, status)).toBe(false);
    }
  });
});

describe("goalStatusSourcesFor (the expected-status guard for the UPDATE)", () => {
  it("only lets an active goal become achieved", () => {
    expect(goalStatusSourcesFor("achieved")).toEqual(["active"]);
  });

  it("lets an active or achieved goal be archived", () => {
    expect(goalStatusSourcesFor("archived").sort()).toEqual(["achieved", "active"]);
  });

  it("only lets an archived goal be revived", () => {
    expect(goalStatusSourcesFor("active")).toEqual(["archived"]);
  });

  it("never includes the target status itself, so a no-op matches zero rows", () => {
    for (const status of GOAL_STATUSES) {
      expect(goalStatusSourcesFor(status)).not.toContain(status);
    }
  });

  it("is exactly the inverse of canTransitionGoalStatus", () => {
    for (const to of GOAL_STATUSES) {
      const sources = goalStatusSourcesFor(to);
      for (const from of GOAL_STATUSES) {
        expect(sources.includes(from)).toBe(canTransitionGoalStatus(from, to));
      }
    }
  });
});

describe("achievedAt preservation contract", () => {
  // setGoalStatus writes achievedAt only on a transition *into* "achieved".
  // Encoding that here keeps the invariant from silently regressing if the
  // matrix grows a new edge: any legal transition whose target isn't "achieved"
  // must leave the column untouched.
  it("archiving is never a transition into achieved", () => {
    const intoAchieved = LEGAL.filter(([, to]) => to === "achieved");
    expect(intoAchieved).toEqual([["active", "achieved"]]);
  });

  it("achieved → archived is legal, so the date must survive it", () => {
    expect(canTransitionGoalStatus("achieved", "archived")).toBe(true);
  });
});
