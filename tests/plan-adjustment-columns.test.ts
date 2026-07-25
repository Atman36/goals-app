import { beforeEach, describe, expect, it, vi } from "vitest";

// T12 — mirrors tests/reflection-upsert-columns.test.ts: mocking
// @/lib/db/queries/* one layer up (as tests/plan-adjustment.test.ts does)
// never exercises drizzle's actual .values()/.onConflictDoNothing() call
// shape, so a wrong conflict target or a missing partial-index predicate
// would pass silently — precisely the kind of gap that has already cost a
// real idempotency bug (mocked-DB blind spot). This stubs the drizzle chain
// itself so the arguments insertPlanAdjustmentTx actually builds can be
// captured and asserted on directly.
const { chain, valuesArgs, conflictArgs } = vi.hoisted(() => {
  const valuesArgs: unknown[] = [];
  const conflictArgs: unknown[] = [];
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn((v: unknown) => {
    valuesArgs.push(v);
    return chain;
  });
  chain.onConflictDoNothing = vi.fn((opts: unknown) => {
    conflictArgs.push(opts);
    return chain;
  });
  chain.returning = vi.fn(async () => [{}]);
  return { chain, valuesArgs, conflictArgs };
});

// insertPlanAdjustmentTx takes its `tx` as an argument rather than reaching for
// the module-level db, but the module still imports `db` at the top for its
// other two exports (getRecentPlanAdjustmentForGoal / listPlanAdjustmentsForUser),
// which would otherwise open a real postgres pool on import.
vi.mock("@/lib/db", () => ({ db: {} }));

import type { Transaction } from "@/lib/db/queries/parent-lock";
import { insertPlanAdjustmentTx } from "@/lib/db/queries/plan-adjustments";
import { planAdjustments, type NewPlanAdjustment } from "@/lib/db/schema";

const GOAL_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  valuesArgs.length = 0;
  conflictArgs.length = 0;
  chain.insert.mockClear();
  chain.values.mockClear();
  chain.onConflictDoNothing.mockClear();
  chain.returning.mockClear();
});

describe("T12 — insertPlanAdjustmentTx's insert shape", () => {
  it("writes exactly the expected column set — not a superset, not a subset", async () => {
    const values: NewPlanAdjustment = {
      goalId: GOAL_ID,
      checklistItemId: null,
      source: "checkin",
      sourceDate: "2026-07-25",
      decision: "keep",
      barrier: "time",
    };

    await insertPlanAdjustmentTx(chain as unknown as Transaction, values);

    expect(valuesArgs).toHaveLength(1);
    const passed = valuesArgs[0] as Record<string, unknown>;
    // T16 FIX-6: `note` is gone from the written set — the column still exists
    // in the applied migration 0014 but has no producer, so nothing sends it.
    expect(new Set(Object.keys(passed))).toEqual(
      new Set(["goalId", "checklistItemId", "source", "sourceDate", "decision", "barrier"]),
    );
  });

  it("conflicts on exactly (goalId, source, sourceDate) with a non-empty partial-index predicate", async () => {
    await insertPlanAdjustmentTx(chain as unknown as Transaction, {
      goalId: GOAL_ID,
      source: "checkin",
      sourceDate: "2026-07-25",
      decision: "keep",
      barrier: "time",
    });

    expect(conflictArgs).toHaveLength(1);
    const opts = conflictArgs[0] as { target: unknown[]; where: unknown };
    expect(opts.target).toEqual([
      planAdjustments.goalId,
      planAdjustments.source,
      planAdjustments.sourceDate,
    ]);
    // Without this predicate Postgres cannot match the partial unique index
    // plan_adjustments_goal_source_date_uniq (WHERE deleted_at IS NULL) as the
    // ON CONFLICT arbiter — an absent/empty predicate is the exact defect this
    // guards against.
    expect(opts.where).toBeDefined();
    expect(opts.where).not.toBeNull();
  });
});
