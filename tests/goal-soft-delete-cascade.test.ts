import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

// T16 FIX-2 — a category-level regression test for softDeleteGoal's cascade.
//
// drizzle/0014 added `plan_adjustments` as a new child of `goals`, with its own
// `deleted_at`, but nothing added it to softDeleteGoal's cascade — so deleting a
// goal left its adjustment rows live underneath it. That is invisible to every
// read in the app today (all of them join `goals` with `deleted_at IS NULL`),
// which is exactly why it needs a test rather than a page check: it is the same
// orphaned-child row shape probe A13 already found once for comment-attached
// media.
//
// Asserting the SET of tables the transaction touches — rather than "was
// plan_adjustments updated" — is deliberate: it fails the NEXT time a goal-child
// table is added and forgotten here, which is the actual recurring defect.
//
// The DB is stubbed at the drizzle-chain level (as tests/plan-adjustment-columns
// .test.ts and tests/reflection-upsert-columns.test.ts do) because there is no
// live database in tests; the shape of the statements is what is under test.
const { dbStub, updatedTables } = vi.hoisted(() => {
  const updatedTables: unknown[] = [];

  // `where()` ends the chain for the child updates (awaited directly) but the
  // goals update calls `.returning()` after it, so the returned object has to
  // serve both: thenable, and carrying `returning`.
  const terminal = {
    returning: async () => [{ id: "22222222-2222-4222-8222-222222222222" }],
    then: (resolve: (value: unknown[]) => void) => resolve([]),
  };

  const tx = {
    update: (table: unknown) => {
      updatedTables.push(table);
      return { set: () => ({ where: () => terminal }) };
    },
  };

  const dbStub = {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(tx),
    // softDeleteGoal builds an `exists(db.select()...)` subquery for the
    // comment-attached media pass; drizzle's exists() only embeds the object in
    // an sql template, so a chain stub is enough — no SQL is ever generated.
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  };

  return { dbStub, updatedTables };
});

vi.mock("@/lib/db", () => ({ db: dbStub }));

import { softDeleteGoal } from "@/lib/db/queries/goals";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  updatedTables.length = 0;
});

describe("T16 FIX-2 — softDeleteGoal's cascade covers every goal child", () => {
  it("soft-deletes exactly the expected set of tables, plan_adjustments included", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const touched = new Set(updatedTables.map((table) => getTableName(table as never)));

    expect(touched).toEqual(
      new Set([
        // the goal itself
        "goals",
        // its children, all of which carry a deleted_at
        "contributions",
        "checklist_items",
        "comments",
        "media_items",
        "checkins",
        "woop_entries",
        "plan_adjustments",
        // the focus pointer released alongside (GA-025)
        "users",
      ]),
    );
  });

  it("names plan_adjustments explicitly, so removing it from the loop fails here", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const touched = updatedTables.map((table) => getTableName(table as never));

    expect(touched).toContain("plan_adjustments");
  });

  it("leaves goal_revisions alone — append-only history outlives its goal", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const touched = updatedTables.map((table) => getTableName(table as never));

    expect(touched).not.toContain("goal_revisions");
  });
});
