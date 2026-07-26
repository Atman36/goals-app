import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

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
const { dbStub, updatedTables, updateWheres } = vi.hoisted(() => {
  const updatedTables: unknown[] = [];
  // The WHERE condition of every update, positionally aligned with
  // `updatedTables` — the second media pass (below) can only be told from the
  // first by what it filters on, not by which table it writes.
  const updateWheres: unknown[] = [];

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
      return {
        set: () => ({
          where: (condition: unknown) => {
            updateWheres.push(condition);
            return terminal;
          },
        }),
      };
    },
  };

  const dbStub = {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(tx),
    // softDeleteGoal builds an `exists(db.select()...)` subquery for the
    // comment-attached media pass. drizzle's exists() only embeds whatever it
    // is given into an sql template, so the stub returns a real SQL fragment
    // carrying the caller's own condition — that keeps the whole WHERE
    // renderable below instead of collapsing into an opaque object.
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => sql`(select 1 from ${table as never} where ${condition as never})`,
      }),
    }),
  };

  return { dbStub, updatedTables, updateWheres };
});

vi.mock("@/lib/db", () => ({ db: dbStub }));

import { softDeleteGoal } from "@/lib/db/queries/goals";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  updatedTables.length = 0;
  updateWheres.length = 0;
});

const dialect = new PgDialect();

/** Rendered SQL of every WHERE clause applied to `tableName` in this run. */
function whereSqlFor(tableName: string): string[] {
  return updateWheres
    .filter((_, i) => getTableName(updatedTables[i] as never) === tableName)
    .map((condition) => dialect.sqlToQuery(condition as never).sql);
}

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

  // Second gap from the same review: the set assertion above cannot see the
  // SECOND media pass. Media attached to a goal's COMMENTS carries no goalId,
  // so the goalId loop never reaches it — that is the exact orphaned-row shape
  // probe A13 found on the live database. Delete that pass and the set above
  // still matches (media_items is written by the loop anyway), which left the
  // pass covered only by a grep over the source in
  // tests/session-2026-07-25-fixes.test.ts. These two check what the statement
  // actually filters on.
  it("writes media_items twice: once by goalId, once through its goal's comments", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const mediaWheres = whereSqlFor("media_items");
    expect(mediaWheres).toHaveLength(2);

    const byGoalId = mediaWheres.filter((s) => s.includes('"media_items"."goal_id"'));
    const byComment = mediaWheres.filter((s) => s.includes('"media_items"."comment_id"'));

    expect(byGoalId, "the direct goalId pass is gone").toHaveLength(1);
    expect(byComment, "the comment-attached media pass is gone").toHaveLength(1);
  });

  it("scopes the comment-attached media pass to THIS goal's comments and skips already-deleted rows", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const [byComment] = whereSqlFor("media_items").filter((s) =>
      s.includes('"media_items"."comment_id"'),
    );

    // Without the goal_id predicate this would soft-delete every comment's
    // media in the database, not just this goal's.
    expect(byComment).toContain('"comments"."goal_id"');
    expect(byComment.toLowerCase()).toContain("exists");
    expect(byComment).toContain('"media_items"."deleted_at" is null');
  });

  it("leaves goal_revisions alone — append-only history outlives its goal", async () => {
    await softDeleteGoal(USER_ID, GOAL_ID);

    const touched = updatedTables.map((table) => getTableName(table as never));

    expect(touched).not.toContain("goal_revisions");
  });
});
