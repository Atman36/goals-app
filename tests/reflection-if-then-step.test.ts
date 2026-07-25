import { beforeEach, describe, expect, it, vi } from "vitest";

// Same shape as tests/reflection-promise-goal.test.ts / contribution-idempotency.test.ts:
// nothing here touches a real database — every query the action calls is stubbed.
vi.mock("@/lib/db", () => ({ db: {} }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_GOAL_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "77777777-7777-4777-8777-777777777777";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER_ID })),
}));

vi.mock("@/lib/db/queries/parent-lock", () => ({
  withLockedLiveGoal: vi.fn(),
}));

vi.mock("@/lib/db/queries/reflections", () => ({
  getLatestReflectionBefore: vi.fn(async () => null),
  getReflectionByWeek: vi.fn(async () => null),
  upsertReflection: vi.fn(),
}));

vi.mock("@/lib/db/queries/goals", () => ({
  listGoals: vi.fn(async () => []),
}));

vi.mock("@/lib/db/queries/checklist", () => ({
  insertChecklistItemTx: vi.fn(),
  updateChecklistItemTx: vi.fn(),
  softDeleteChecklistItemTx: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveReflection, type ReflectionState } from "@/lib/actions/reflections";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { getReflectionByWeek, upsertReflection } from "@/lib/db/queries/reflections";
import {
  insertChecklistItemTx,
  softDeleteChecklistItemTx,
  updateChecklistItemTx,
} from "@/lib/db/queries/checklist";
import { listGoals } from "@/lib/db/queries/goals";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";

const lockMock = vi.mocked(withLockedLiveGoal);
const upsertMock = vi.mocked(upsertReflection);
const getCurrentReflectionMock = vi.mocked(getReflectionByWeek);
const listGoalsMock = vi.mocked(listGoals);
const insertItemMock = vi.mocked(insertChecklistItemTx);
const updateItemMock = vi.mocked(updateChecklistItemTx);
const softDeleteItemMock = vi.mocked(softDeleteChecklistItemTx);

// The real week boundary (Monday, UTC) — mirrors what app/(app)/reflections/page.tsx
// posts back as the hidden expectedWeekStart field (see reflection-promise-goal.test.ts).
const CURRENT_WEEK_START = weekStartKey(todayKey());

const initialState: ReflectionState = { status: "idle" };

/** A fake tx marker — asserted against by reference (not just "some tx"), the
 *  same idiom tests/reflection-promise-goal.test.ts uses for its own
 *  architectural test. */
const fakeTx = { marker: "fake-tx" };

function lockGrantsGoal() {
  lockMock.mockImplementation(async (_userId, goalId, work) =>
    work(fakeTx as never, { id: goalId, status: "active", currency: null }),
  );
}

function formData(overrides: Record<string, string | undefined> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string | undefined> = {
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

/** getReflectionByWeek's return shape (ReflectionWithPromiseGoal) — this
 *  week's already-saved row, read before the lock to decide create vs.
 *  update vs. delete for the if-then step (Decisions #3). */
function currentReflectionRow(overrides: Record<string, unknown> = {}) {
  return {
    ...savedRow(),
    promiseGoal: { id: GOAL_ID, title: "Цель" },
    ...overrides,
  };
}

function checklistItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    goalId: GOAL_ID,
    title: "Если тревога — то сделаю дыхательное упражнение",
    note: null,
    dueDate: "2026-07-26",
    kind: "if_then",
    ifThen: { trigger: "тревога", action: "сделаю дыхательное упражнение", planType: "initiation" },
    isDone: false,
    doneAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  lockMock.mockReset();
  upsertMock.mockReset();
  getCurrentReflectionMock.mockReset();
  listGoalsMock.mockReset();
  insertItemMock.mockReset();
  updateItemMock.mockReset();
  softDeleteItemMock.mockReset();

  getCurrentReflectionMock.mockResolvedValue(null);
  listGoalsMock.mockResolvedValue([]);
  upsertMock.mockResolvedValue(savedRow());
});

describe("T5 — if-then step creation", () => {
  it("creates a checklist item and records its id + a derived newIfThen on the reflection", async () => {
    lockGrantsGoal();
    insertItemMock.mockResolvedValue(checklistItemRow() as never);

    const result = await saveReflection(
      initialState,
      formData({ ifThenTrigger: "тревога", ifThenAction: "сделаю дыхательное упражнение" }),
    );

    expect(result.status).toBe("success");
    expect(insertItemMock).toHaveBeenCalledTimes(1);
    expect(insertItemMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        goalId: GOAL_ID,
        kind: "if_then",
        ifThen: {
          trigger: "тревога",
          action: "сделаю дыхательное упражнение",
          planType: "initiation",
        },
      }),
    );
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({ ifThenItemId: ITEM_ID }),
      fakeTx,
    );
  });

  it("formats newIfThen as 'Если <trigger> — то <action>'", async () => {
    lockGrantsGoal();
    insertItemMock.mockResolvedValue(checklistItemRow() as never);

    await saveReflection(
      initialState,
      formData({ ifThenTrigger: "тревога", ifThenAction: "сделаю дыхательное упражнение" }),
    );

    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({
        newIfThen: "Если тревога — то сделаю дыхательное упражнение",
      }),
      fakeTx,
    );
  });

  it("defaults planType to initiation when none is submitted", async () => {
    lockGrantsGoal();
    insertItemMock.mockResolvedValue(checklistItemRow() as never);

    await saveReflection(initialState, formData({ ifThenTrigger: "т", ifThenAction: "д" }));

    expect(insertItemMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ ifThen: expect.objectContaining({ planType: "initiation" }) }),
    );
  });

  it("saves an explicitly submitted planType as-is", async () => {
    lockGrantsGoal();
    insertItemMock.mockResolvedValue(
      checklistItemRow({ ifThen: { trigger: "т", action: "д", planType: "maintenance" } }) as never,
    );

    await saveReflection(
      initialState,
      formData({ ifThenTrigger: "т", ifThenAction: "д", ifThenPlanType: "maintenance" }),
    );

    expect(insertItemMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ ifThen: expect.objectContaining({ planType: "maintenance" }) }),
    );
  });
});

describe("T5 — idempotency (Decisions #3)", () => {
  it("updates the SAME step on a same-week resave instead of creating a second one", async () => {
    getCurrentReflectionMock.mockResolvedValue(currentReflectionRow({ ifThenItemId: ITEM_ID }) as never);
    lockGrantsGoal();
    updateItemMock.mockResolvedValue(checklistItemRow() as never);

    const result = await saveReflection(
      initialState,
      formData({ ifThenTrigger: "новый триггер", ifThenAction: "новое действие" }),
    );

    expect(result.status).toBe("success");
    expect(insertItemMock).not.toHaveBeenCalled();
    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(updateItemMock).toHaveBeenCalledWith(
      fakeTx,
      GOAL_ID,
      ITEM_ID,
      expect.objectContaining({
        ifThen: { trigger: "новый триггер", action: "новое действие", planType: "initiation" },
      }),
    );
    // The id is REUSED, not replaced.
    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({ ifThenItemId: ITEM_ID }),
      fakeTx,
    );
  });
});

describe("T5 — clearing the step (Decisions #4)", () => {
  it("soft-deletes the existing step and nulls ifThenItemId when both fields are emptied", async () => {
    getCurrentReflectionMock.mockResolvedValue(currentReflectionRow({ ifThenItemId: ITEM_ID }) as never);
    lockGrantsGoal();
    softDeleteItemMock.mockResolvedValue(checklistItemRow({ deletedAt: new Date() }) as never);

    const result = await saveReflection(
      initialState,
      formData({ ifThenTrigger: "", ifThenAction: "" }),
    );

    expect(result.status).toBe("success");
    expect(softDeleteItemMock).toHaveBeenCalledWith(fakeTx, GOAL_ID, ITEM_ID);
    expect(insertItemMock).not.toHaveBeenCalled();
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledWith(
      USER_ID,
      CURRENT_WEEK_START,
      expect.objectContaining({ ifThenItemId: null }),
      fakeTx,
    );
  });
});

describe("T5 — partial if-then input is rejected", () => {
  it("rejects trigger filled without action, writing nothing", async () => {
    const result = await saveReflection(
      initialState,
      formData({ ifThenTrigger: "тревога", ifThenAction: "" }),
    );

    expect(result.status).toBe("error");
    expect(lockMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(insertItemMock).not.toHaveBeenCalled();
  });

  it("rejects action filled without trigger, writing nothing", async () => {
    const result = await saveReflection(
      initialState,
      formData({ ifThenTrigger: "", ifThenAction: "сделаю дыхательное упражнение" }),
    );

    expect(result.status).toBe("error");
    expect(lockMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("T5 — foreign or deleted goal writes nothing", () => {
  it("writes neither the step nor the reflection when the lock returns null", async () => {
    lockMock.mockResolvedValue(null); // withLockedLiveGoal's contract: null = not found/foreign/deleted

    const result = await saveReflection(
      initialState,
      formData({
        promiseGoalId: OTHER_GOAL_ID,
        ifThenTrigger: "тревога",
        ifThenAction: "сделаю дыхательное упражнение",
      }),
    );

    expect(result.status).toBe("error");
    expect(insertItemMock).not.toHaveBeenCalled();
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(softDeleteItemMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("T5 — architectural: the step and the reflection share one tx", () => {
  it("passes the SAME tx object withLockedLiveGoal handed to the callback to both writes", async () => {
    lockGrantsGoal();
    insertItemMock.mockResolvedValue(checklistItemRow() as never);

    await saveReflection(
      initialState,
      formData({ ifThenTrigger: "тревога", ifThenAction: "сделаю дыхательное упражнение" }),
    );

    expect(insertItemMock.mock.calls[0]?.[0]).toBe(fakeTx);
    expect(upsertMock.mock.calls[0]?.[3]).toBe(fakeTx);
  });
});
