import { describe, expect, it } from "vitest";
import { bucketGoals, classifyActivity, type GoalActivity } from "@/lib/utils/weekly-review";

const TODAY = "2026-07-09";

describe("classifyActivity", () => {
  it("treats activity yesterday as progressed", () => {
    expect(
      classifyActivity({ lastActivityKey: "2026-07-08", createdAtKey: "2026-01-01", todayKey: TODAY }),
    ).toBe("progressed");
  });

  it("treats activity 6 days ago as progressed", () => {
    expect(
      classifyActivity({ lastActivityKey: "2026-07-03", createdAtKey: "2026-01-01", todayKey: TODAY }),
    ).toBe("progressed");
  });

  it("treats activity 8 days ago (idle 8, under the stalled threshold) as steady", () => {
    expect(
      classifyActivity({ lastActivityKey: "2026-07-01", createdAtKey: "2026-01-01", todayKey: TODAY }),
    ).toBe("steady");
  });

  it("treats activity 20 days ago as stalled", () => {
    expect(
      classifyActivity({ lastActivityKey: "2026-06-19", createdAtKey: "2026-01-01", todayKey: TODAY }),
    ).toBe("stalled");
  });

  it("treats a goal with no activity created 3 days ago as steady", () => {
    expect(
      classifyActivity({ lastActivityKey: null, createdAtKey: "2026-07-06", todayKey: TODAY }),
    ).toBe("steady");
  });

  it("treats a goal with no activity created 30 days ago as stalled", () => {
    expect(
      classifyActivity({ lastActivityKey: null, createdAtKey: "2026-06-09", todayKey: TODAY }),
    ).toBe("stalled");
  });

  it("treats idle exactly at the stalled threshold (14 days) as stalled", () => {
    expect(
      classifyActivity({ lastActivityKey: null, createdAtKey: "2026-06-25", todayKey: TODAY }),
    ).toBe("stalled");
  });
});

describe("bucketGoals", () => {
  it("groups goals into the correct buckets and preserves input order within each bucket", () => {
    const goals: GoalActivity[] = [
      {
        goalId: "g-stalled-1",
        title: "Stalled goal 1",
        lastActivityKey: "2026-06-19", // 20 days ago
        createdAtKey: "2026-01-01",
        contributionsInWindow: 0,
        stepsDoneInWindow: 0,
        checkinsInWindow: 0,
        sphere: null,
      },
      {
        goalId: "g-progressed-1",
        title: "Progressed goal 1",
        lastActivityKey: "2026-07-08", // yesterday
        createdAtKey: "2026-01-01",
        contributionsInWindow: 2,
        stepsDoneInWindow: 1,
        checkinsInWindow: 0,
        sphere: null,
      },
      {
        goalId: "g-steady-1",
        title: "Steady goal 1",
        lastActivityKey: "2026-07-01", // 8 days ago
        createdAtKey: "2026-01-01",
        contributionsInWindow: 0,
        stepsDoneInWindow: 0,
        checkinsInWindow: 0,
        sphere: null,
      },
      {
        goalId: "g-progressed-2",
        title: "Progressed goal 2",
        lastActivityKey: "2026-07-03", // 6 days ago
        createdAtKey: "2026-01-01",
        contributionsInWindow: 1,
        stepsDoneInWindow: 0,
        checkinsInWindow: 0,
        sphere: null,
      },
      {
        goalId: "g-stalled-2",
        title: "Stalled goal 2",
        lastActivityKey: null,
        createdAtKey: "2026-06-09", // 30 days ago
        contributionsInWindow: 0,
        stepsDoneInWindow: 0,
        checkinsInWindow: 0,
        sphere: null,
      },
    ];

    const buckets = bucketGoals(goals, TODAY);

    expect(buckets.progressed.map((g) => g.goalId)).toEqual(["g-progressed-1", "g-progressed-2"]);
    expect(buckets.stalled.map((g) => g.goalId)).toEqual(["g-stalled-1", "g-stalled-2"]);
    expect(buckets.steady.map((g) => g.goalId)).toEqual(["g-steady-1"]);
  });
});
