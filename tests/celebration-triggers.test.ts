import { beforeEach, describe, expect, it, vi } from "vitest";

// Same shape as tests/reflection-if-then-step.test.ts: nothing here touches a
// real database — every query the action calls is stubbed.
vi.mock("@/lib/db", () => ({ db: {} }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER_ID })),
}));

vi.mock("@/lib/db/queries/parent-lock", () => ({ withLockedLiveGoal: vi.fn() }));

vi.mock("@/lib/db/queries/reflections", () => ({
  getLatestReflectionBefore: vi.fn(async () => null),
  getReflectionByWeek: vi.fn(async () => null),
  upsertReflection: vi.fn(),
}));

vi.mock("@/lib/db/queries/goals", () => ({ listGoals: vi.fn(async () => []) }));

vi.mock("@/lib/db/queries/checklist", () => ({
  insertChecklistItemTx: vi.fn(),
  updateChecklistItemTx: vi.fn(),
  softDeleteChecklistItemTx: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveReflection, type ReflectionState } from "@/lib/actions/reflections";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import {
  getLatestReflectionBefore,
  getReflectionByWeek,
  upsertReflection,
} from "@/lib/db/queries/reflections";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";

// T9 (PLAN §6 C2). Celebration moved off "a contribution was logged" and onto
// "a weekly cycle closed". These tests pin the trigger itself: it fires once,
// on the transition from no outcome to an outcome, and it fires for an honest
// «Не в этот раз» exactly as it does for «Сделал» — what is being marked is
// the closing of the cycle, not the success of the week.

const lockMock = vi.mocked(withLockedLiveGoal);
const upsertMock = vi.mocked(upsertReflection);
const currentWeekMock = vi.mocked(getReflectionByWeek);
const previousWeekMock = vi.mocked(getLatestReflectionBefore);

const CURRENT_WEEK_START = weekStartKey(todayKey());
const initialState: ReflectionState = { status: "idle" };
const fakeTx = { marker: "fake-tx" };

function savedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    userId: USER_ID,
    weekStart: CURRENT_WEEK_START,
    promised: null,
    done: null,
    blocked: null,
    learned: null,
    promise: "Пробежать 3 раза на этой неделе",
    prevOutcome: null,
    newIfThen: null,
    promiseGoalId: GOAL_ID,
    ifThenItemId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function currentWeekRow(overrides: Record<string, unknown> = {}) {
  return { ...savedRow(), promiseGoal: { id: GOAL_ID, title: "Цель" }, ...overrides };
}

function formData(overrides: Record<string, string | undefined> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string | undefined> = {
    // The four optional questions are posted as empty strings, exactly as a
    // real submit does: formData.get() yields `null` for an absent field, and
    // the validator accepts "" but not null.
    promised: "",
    done: "",
    blocked: "",
    learned: "",
    promise: "Пробежать 3 раза на этой неделе",
    promiseGoalId: GOAL_ID,
    expectedWeekStart: CURRENT_WEEK_START,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  lockMock.mockReset();
  upsertMock.mockReset();
  currentWeekMock.mockReset();
  previousWeekMock.mockReset();

  currentWeekMock.mockResolvedValue(null);
  // A promise was made last week, so an outcome is expected this week.
  previousWeekMock.mockResolvedValue(
    savedRow({ weekStart: "2026-07-13", promise: "Дописать главу" }) as never,
  );
  upsertMock.mockResolvedValue(savedRow() as never);
  lockMock.mockImplementation(async (_userId, goalId, work) =>
    work(fakeTx as never, { id: goalId, status: "active", currency: null }),
  );
});

describe("cycleClosed", () => {
  it("is set when this save first records the previous promise's outcome", async () => {
    const state = await saveReflection(initialState, formData({ prevOutcome: "done" }));

    expect(state.status).toBe("success");
    expect(state.cycleClosed).toBe(true);
  });

  it("is not set when re-saving a week whose outcome was already recorded", async () => {
    currentWeekMock.mockResolvedValue(currentWeekRow({ prevOutcome: "done" }) as never);

    const state = await saveReflection(initialState, formData({ prevOutcome: "done" }));

    expect(state.status).toBe("success");
    expect(state.cycleClosed).toBe(false);
  });

  it("is not set when there is no previous promise to close", async () => {
    previousWeekMock.mockResolvedValue(null);

    const state = await saveReflection(initialState, formData());

    expect(state.status).toBe("success");
    expect(state.cycleClosed).toBe(false);
  });

  it("celebrates an honest «Не в этот раз» exactly like any other outcome", async () => {
    const state = await saveReflection(initialState, formData({ prevOutcome: "skipped" }));

    expect(state.cycleClosed).toBe(true);
  });

  it.each(["done", "partial", "skipped"])("closes the cycle on outcome %s", async (outcome) => {
    const state = await saveReflection(initialState, formData({ prevOutcome: outcome }));

    expect(state.cycleClosed).toBe(true);
  });

  it("celebrates nothing when the save itself failed", async () => {
    // The goal is gone: withLockedLiveGoal refuses and nothing is written.
    lockMock.mockResolvedValue(null);

    const state = await saveReflection(initialState, formData({ prevOutcome: "done" }));

    expect(state.status).toBe("error");
    expect(state.cycleClosed).toBeFalsy();
  });

  it("celebrates nothing when the outcome is missing but required", async () => {
    const state = await saveReflection(initialState, formData());

    expect(state.status).toBe("error");
    expect(state.cycleClosed).toBeFalsy();
  });

  it("celebrates nothing when the week rolled over mid-form", async () => {
    const state = await saveReflection(
      initialState,
      formData({ prevOutcome: "done", expectedWeekStart: "2026-01-05" }),
    );

    expect(state.status).toBe("stale");
    expect(state.cycleClosed).toBeFalsy();
  });
});
