import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanAdjustment } from "@/lib/db/schema";
import { todayKey } from "@/lib/utils/date-keys";

// T12. savePlanAdjustment's decision branching, against a mocked @/lib/db
// stack — same mocking shape as tests/contribution-idempotency.test.ts.

vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER_ID })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));

const { withLockedLiveGoalMock } = vi.hoisted(() => ({ withLockedLiveGoalMock: vi.fn() }));
vi.mock("@/lib/db/queries/parent-lock", () => ({
  withLockedLiveGoal: withLockedLiveGoalMock,
}));

vi.mock("@/lib/db/queries/plan-adjustments", () => ({
  insertPlanAdjustmentTx: vi.fn(),
}));

vi.mock("@/lib/db/queries/checklist", () => ({
  getChecklistItemTx: vi.fn(),
  insertChecklistItemTx: vi.fn(),
  updateChecklistItemTx: vi.fn(),
}));

import { savePlanAdjustment } from "@/lib/actions/plan-adjustments";
import { track } from "@/lib/analytics/events";
import {
  getChecklistItemTx,
  insertChecklistItemTx,
  updateChecklistItemTx,
} from "@/lib/db/queries/checklist";
import { insertPlanAdjustmentTx } from "@/lib/db/queries/plan-adjustments";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const NEW_ITEM_ID = "44444444-4444-4444-8444-444444444444";

const FAKE_TX = { marker: "tx" } as never;
const ACTIVE_GOAL = { id: GOAL_ID, status: "active" as const, currency: null };

const insertPlanAdjustmentTxMock = vi.mocked(insertPlanAdjustmentTx);
const getChecklistItemTxMock = vi.mocked(getChecklistItemTx);
const insertChecklistItemTxMock = vi.mocked(insertChecklistItemTx);
const updateChecklistItemTxMock = vi.mocked(updateChecklistItemTx);
const trackMock = vi.mocked(track);

/** Wires withLockedLiveGoal to actually invoke the caller's callback with a
 *  fake tx and a locked, active goal — the common case for every test but the
 *  "goal not found" one. */
function mockLiveLock() {
  withLockedLiveGoalMock.mockImplementation(async (_userId, _goalId, work) =>
    work(FAKE_TX, ACTIVE_GOAL),
  );
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    goalId: GOAL_ID,
    source: "checkin",
    expectedToken: todayKey(new Date()),
    barrier: "time",
    decision: "keep",
    ...overrides,
  };
}

/** A row shape close enough to PlanAdjustment for the action's purposes — it
 *  only branches on truthiness. */
function insertedRow(overrides: Partial<PlanAdjustment> = {}): PlanAdjustment {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    goalId: GOAL_ID,
    checklistItemId: null,
    source: "checkin",
    sourceDate: todayKey(new Date()),
    decision: "keep",
    barrier: "time",
    note: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  withLockedLiveGoalMock.mockReset();
  insertPlanAdjustmentTxMock.mockReset();
  getChecklistItemTxMock.mockReset();
  insertChecklistItemTxMock.mockReset();
  updateChecklistItemTxMock.mockReset();
  trackMock.mockClear();

  insertPlanAdjustmentTxMock.mockResolvedValue(insertedRow());
});

describe("savePlanAdjustment", () => {
  it("reports not_found when the goal is foreign, deleted, or missing", async () => {
    withLockedLiveGoalMock.mockResolvedValue(null);

    const result = await savePlanAdjustment(baseInput());

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("'smaller' updates the checklist item with exactly the new title", async () => {
    mockLiveLock();
    updateChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID } as never);

    const result = await savePlanAdjustment(
      baseInput({ decision: "smaller", checklistItemId: ITEM_ID, stepTitle: "Меньший шаг" }),
    );

    expect(result).toEqual({ ok: true, duplicate: false, changedStep: true });
    expect(updateChecklistItemTxMock).toHaveBeenCalledWith(FAKE_TX, GOAL_ID, ITEM_ID, {
      title: "Меньший шаг",
    });
  });

  it("'change_trigger' refuses with no_if_then when the item has no if-then plan, without writing", async () => {
    mockLiveLock();
    getChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID, ifThen: null } as never);

    const result = await savePlanAdjustment(
      baseInput({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "после обеда" }),
    );

    expect(result).toEqual({ ok: false, reason: "no_if_then" });
    expect(updateChecklistItemTxMock).not.toHaveBeenCalled();
  });

  it("'change_trigger' replaces only the trigger, keeping action and planType", async () => {
    mockLiveLock();
    getChecklistItemTxMock.mockResolvedValue({
      id: ITEM_ID,
      ifThen: { trigger: "утром", action: "позвонить тренеру", planType: "initiation" },
    } as never);
    updateChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID } as never);

    const result = await savePlanAdjustment(
      baseInput({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "вечером" }),
    );

    expect(result).toEqual({ ok: true, duplicate: false, changedStep: true });
    expect(updateChecklistItemTxMock).toHaveBeenCalledWith(FAKE_TX, GOAL_ID, ITEM_ID, {
      ifThen: { trigger: "вечером", action: "позвонить тренеру", planType: "initiation" },
    });
  });

  // B4 review tail, closed after B5: a step born from "add_coping_plan" has a
  // title derived from its if-then, so changing the trigger alone used to leave
  // the goal page showing a heading that quoted the OLD trigger next to an
  // «если—то» line with the new one.
  it("'change_trigger' rewrites a title that is still exactly the derived coping-plan form", async () => {
    mockLiveLock();
    getChecklistItemTxMock.mockResolvedValue({
      id: ITEM_ID,
      title: "Если накрыло вечером — то написать одному человеку",
      ifThen: {
        trigger: "накрыло вечером",
        action: "написать одному человеку",
        planType: "relapse_prevention",
      },
    } as never);
    updateChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID } as never);

    const result = await savePlanAdjustment(
      baseInput({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "накрыло утром" }),
    );

    expect(result).toEqual({ ok: true, duplicate: false, changedStep: true });
    expect(updateChecklistItemTxMock).toHaveBeenCalledWith(FAKE_TX, GOAL_ID, ITEM_ID, {
      ifThen: {
        trigger: "накрыло утром",
        action: "написать одному человеку",
        planType: "relapse_prevention",
      },
      title: "Если накрыло утром — то написать одному человеку",
    });
  });

  it("'change_trigger' leaves a hand-written title alone", async () => {
    mockLiveLock();
    getChecklistItemTxMock.mockResolvedValue({
      id: ITEM_ID,
      title: "Мой собственный заголовок",
      ifThen: {
        trigger: "накрыло вечером",
        action: "написать одному человеку",
        planType: "relapse_prevention",
      },
    } as never);
    updateChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID } as never);

    await savePlanAdjustment(
      baseInput({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "накрыло утром" }),
    );

    // The whole patch — no `title` key at all, so drizzle cannot overwrite it.
    expect(updateChecklistItemTxMock).toHaveBeenCalledWith(FAKE_TX, GOAL_ID, ITEM_ID, {
      ifThen: {
        trigger: "накрыло утром",
        action: "написать одному человеку",
        planType: "relapse_prevention",
      },
    });
  });

  it("'change_trigger' recognizes a derived title that had to be truncated to 200 chars", async () => {
    mockLiveLock();
    const longAction = "а".repeat(250);
    const storedTitle = `${`Если старый триггер — то ${longAction}`.slice(0, 199)}…`;
    getChecklistItemTxMock.mockResolvedValue({
      id: ITEM_ID,
      title: storedTitle,
      ifThen: { trigger: "старый триггер", action: longAction, planType: "relapse_prevention" },
    } as never);
    updateChecklistItemTxMock.mockResolvedValue({ id: ITEM_ID } as never);

    await savePlanAdjustment(
      baseInput({ decision: "change_trigger", checklistItemId: ITEM_ID, trigger: "новый триггер" }),
    );

    const patch = updateChecklistItemTxMock.mock.calls[0][3] as { title?: string };
    expect(patch.title).toBe(`${`Если новый триггер — то ${longAction}`.slice(0, 199)}…`);
    expect(patch.title!.length).toBe(200);
  });

  it("'add_coping_plan' creates a new if_then item with planType relapse_prevention", async () => {
    mockLiveLock();
    insertChecklistItemTxMock.mockResolvedValue({ id: NEW_ITEM_ID } as never);

    const result = await savePlanAdjustment(
      baseInput({
        decision: "add_coping_plan",
        copingTrigger: "если тревога",
        copingAction: "сделать паузу",
      }),
    );

    expect(result).toEqual({ ok: true, duplicate: false, changedStep: true });
    expect(insertChecklistItemTxMock).toHaveBeenCalledWith(
      FAKE_TX,
      expect.objectContaining({
        goalId: GOAL_ID,
        kind: "if_then",
        ifThen: {
          trigger: "если тревога",
          action: "сделать паузу",
          planType: "relapse_prevention",
        },
      }),
    );
  });

  it("a conflicting insert reports a duplicate and touches no checklist item", async () => {
    mockLiveLock();
    insertPlanAdjustmentTxMock.mockResolvedValue(null);

    const result = await savePlanAdjustment(
      baseInput({ decision: "smaller", checklistItemId: ITEM_ID, stepTitle: "Меньший шаг" }),
    );

    expect(result).toEqual({ ok: true, duplicate: true, changedStep: false });
    expect(updateChecklistItemTxMock).not.toHaveBeenCalled();
    expect(getChecklistItemTxMock).not.toHaveBeenCalled();
    expect(insertChecklistItemTxMock).not.toHaveBeenCalled();
  });

  it("does not track a duplicate submission", async () => {
    mockLiveLock();
    insertPlanAdjustmentTxMock.mockResolvedValue(null);

    await savePlanAdjustment(baseInput());

    expect(trackMock).not.toHaveBeenCalled();
  });
});
