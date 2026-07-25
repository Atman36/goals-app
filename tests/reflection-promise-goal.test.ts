import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's dependency graph reaches lib/db, which opens a postgres pool on
// import. Nothing here touches a real database — every query the action calls
// is stubbed per test, same shape as tests/contribution-idempotency.test.ts.
vi.mock("@/lib/db", () => ({ db: {} }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_GOAL_ID = "33333333-3333-4333-8333-333333333333";
const DELETED_GOAL_ID = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER_ID })),
}));

vi.mock("@/lib/db/queries/parent-lock", () => ({
  withLockedLiveGoal: vi.fn(),
}));

vi.mock("@/lib/db/queries/reflections", () => ({
  getLatestReflectionBefore: vi.fn(async () => null),
  upsertReflection: vi.fn(),
}));

vi.mock("@/lib/db/queries/goals", () => ({
  listGoals: vi.fn(async () => []),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveReflection, type ReflectionState } from "@/lib/actions/reflections";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { getLatestReflectionBefore, upsertReflection } from "@/lib/db/queries/reflections";
import { listGoals } from "@/lib/db/queries/goals";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";

const lockMock = vi.mocked(withLockedLiveGoal);
const upsertMock = vi.mocked(upsertReflection);
const getLatestMock = vi.mocked(getLatestReflectionBefore);
const listGoalsMock = vi.mocked(listGoals);

// The real week boundary (Monday, UTC) — mirrors what app/(app)/reflections/page.tsx
// posts back as the hidden expectedWeekStart field, so a real submit matches
// what the action independently re-derives via resolveReflectionWeek(now=real Date).
const CURRENT_WEEK_START = weekStartKey(todayKey());

const initialState: ReflectionState = { status: "idle" };

/** An otherwise-valid submit. The four optional textareas post "" when left
 *  blank (real <textarea>s are always in the DOM, per reflection-form.tsx's
 *  FIELDS map), matching what reflectionInputSchema's empty-string transform
 *  expects — only `""` becomes undefined, a bare `null` fails validation.
 *  Passing `undefined` for a key omits it from the FormData entirely,
 *  mirroring a control that was never rendered (e.g. the goal <select> when
 *  the "no active goals" branch renders instead, or prevOutcome when there is
 *  no previous promise to react to). */
function formData(overrides: Record<string, string | undefined> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string | undefined> = {
    promised: "",
    done: "",
    blocked: "",
    learned: "",
    promise: "Пробежать 3 раза на этой неделе",
    newIfThen: "",
    expectedWeekStart: CURRENT_WEEK_START,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

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
    promiseGoalId: null,
    ifThenItemId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  lockMock.mockReset();
  upsertMock.mockReset();
  listGoalsMock.mockReset();
  getLatestMock.mockReset();
  getLatestMock.mockResolvedValue(null);
  listGoalsMock.mockResolvedValue([]);
});

describe("T4 — the write path refuses a foreign or deleted goal under the lock", () => {
  it("refuses a foreign goal and writes nothing", async () => {
    lockMock.mockResolvedValue(null); // withLockedLiveGoal's contract: null = not found/foreign/deleted

    const result = await saveReflection(initialState, formData({ promiseGoalId: OTHER_GOAL_ID }));

    expect(result).toEqual({ status: "error", message: "Цель не найдена или удалена" });
    expect(lockMock).toHaveBeenCalledWith(USER_ID, OTHER_GOAL_ID, expect.any(Function));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses a soft-deleted goal and writes nothing", async () => {
    lockMock.mockResolvedValue(null); // same contract: a deleted goal is indistinguishable from foreign

    const result = await saveReflection(initialState, formData({ promiseGoalId: DELETED_GOAL_ID }));

    expect(result).toEqual({ status: "error", message: "Цель не найдена или удалена" });
    expect(lockMock).toHaveBeenCalledWith(USER_ID, DELETED_GOAL_ID, expect.any(Function));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("requires a goal to be chosen when the user has active goals", async () => {
    listGoalsMock.mockResolvedValue([{ id: GOAL_ID } as never]);

    const result = await saveReflection(initialState, formData());

    expect(result).toEqual({
      status: "error",
      message: "Выберите цель, к которой относится обещание",
    });
    expect(lockMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves without a goal link when the user has no active goals (back-compat)", async () => {
    listGoalsMock.mockResolvedValue([]);
    upsertMock.mockResolvedValue(savedRow());

    const result = await saveReflection(initialState, formData());

    expect(result.status).toBe("success");
    expect(lockMock).not.toHaveBeenCalled(); // D4: no goal, no transaction opened
    expect(upsertMock).toHaveBeenCalledTimes(1);
    // Called with exactly (userId, weekStart, fields) — no 4th (tx) argument.
    expect(upsertMock.mock.calls[0]).toHaveLength(3);
    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({ promiseGoalId: undefined }),
    );
  });

  it("saves the owned live goal onto the row", async () => {
    const fakeTx = { marker: "fake-tx" };
    lockMock.mockImplementation(async (userId, goalId, work) =>
      work(fakeTx as never, { id: goalId, status: "active", currency: null }),
    );
    upsertMock.mockResolvedValue(savedRow({ promiseGoalId: GOAL_ID }));

    const result = await saveReflection(initialState, formData({ promiseGoalId: GOAL_ID }));

    expect(result.status).toBe("success");
    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({ promiseGoalId: GOAL_ID }),
      fakeTx,
    );
  });

  it("architectural: writes through the SAME tx object withLockedLiveGoal handed to the callback", async () => {
    const fakeTx = { marker: "fake-tx" };
    lockMock.mockImplementation(async (userId, goalId, work) =>
      work(fakeTx as never, { id: goalId, status: "active", currency: null }),
    );
    upsertMock.mockResolvedValue(savedRow({ promiseGoalId: GOAL_ID }));

    await saveReflection(initialState, formData({ promiseGoalId: GOAL_ID }));

    // Not just "some tx" — the exact reference the lock handed the callback,
    // proving the write happens INSIDE the lock rather than after it.
    expect(upsertMock.mock.calls[0]?.[3]).toBe(fakeTx);
  });

  it("rejects a stale week before the lock, the goal list, or any write is touched", async () => {
    const result = await saveReflection(
      initialState,
      formData({ expectedWeekStart: "1999-01-04", promiseGoalId: GOAL_ID }),
    );

    expect(result.status).toBe("stale");
    expect(lockMock).not.toHaveBeenCalled();
    expect(listGoalsMock).not.toHaveBeenCalled();
    expect(getLatestMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
