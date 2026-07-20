import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// SOFT-DELETE-002 · DATA-OWNERSHIP-001 · CURRENCY-001 · WOOP-001 · REVISION-001/002
//
// These are structural assertions on source text, and that is a real limit: they
// prove the lock protocol is *written*, not that Postgres serializes two live
// transactions the way it is meant to. Only testing/current_schema_concurrency.ts
// against a disposable database can prove the latter, and it has not been run.
// What these catch is the regression that actually happened before — a write path
// quietly going back to "check the parent, then insert in a separate statement".

const CHILD_WRITE_PATHS = [
  "lib/db/queries/contributions.ts",
  "lib/db/queries/checklist.ts",
  "lib/db/queries/comments.ts",
  "lib/db/queries/woop.ts",
  "lib/db/queries/checkins.ts",
  "lib/db/queries/media.ts",
];

describe("GA-015: every child write goes through the locked-parent helper", () => {
  it.each(CHILD_WRITE_PATHS)("%s imports the shared lock protocol", (path) => {
    expect(source(path)).toContain("@/lib/db/queries/parent-lock");
  });

  it.each(CHILD_WRITE_PATHS)("%s issues no insert on the unlocked connection", (path) => {
    // `db.insert(` is the pre-fix shape: an insert on the module-level client
    // rather than on the transaction handle the helper hands out.
    expect(source(path)).not.toMatch(/\bdb\s*\.\s*insert\(/);
  });

  it("the helper locks the goal row FOR UPDATE and refuses a dead parent", () => {
    const code = source("lib/db/queries/parent-lock.ts");

    expect(code).toContain('.for("update")');
    expect(code).toContain("isNull(goals.deletedAt)");
    expect(code).toContain("if (!goal) return null;");
  });

  it("comment-attached media locks the goal, keeping one lock order app-wide", () => {
    // Locking the comment row here instead would give two different lock
    // orders on the same pair of tables, which is how deadlocks are built.
    expect(source("lib/db/queries/parent-lock.ts")).toContain('.for("update", { of: goals })');
  });
});

describe("GA-012 · GA-016: the goal edit decides everything under one lock", () => {
  const code = source("lib/db/queries/goal-revisions.ts");

  it("compares the optimistic token against the locked row", () => {
    expect(code).toContain("expectedUpdatedAt");
    expect(code).toContain("current.updatedAt.getTime() !== expectedUpdatedAt.getTime()");
  });

  it("returns stale before writing anything", () => {
    // The revision insert must come after the staleness check — a refused edit
    // that still recorded a revision would leave a snapshot of a write that
    // never happened.
    const stalePos = code.indexOf('return { status: "stale"');
    const revisionPos = code.indexOf("insert(goalRevisions)");
    expect(stalePos).toBeGreaterThan(-1);
    expect(revisionPos).toBeGreaterThan(stalePos);
  });

  it("counts live contributions inside the transaction, not in the action", () => {
    expect(code).toContain('return { status: "currency_locked" }');
    expect(code).toContain("isNull(contributions.deletedAt)");
    // The action must no longer pre-check it in its own round trip.
    expect(source("lib/actions/goals.ts")).not.toContain("await hasContributions(");
  });

  it("never writes a client-supplied updatedAt", () => {
    // The token is compared only; the stored value is always server-derived.
    expect(code).toContain("updatedAt: new Date()");
    expect(code).not.toContain("updatedAt: expectedUpdatedAt");
  });
});

describe("GA-017: one WOOP row per goal", () => {
  it("create-or-update is decided inside the locked query, not by the action", () => {
    const action = source("lib/actions/woop.ts");

    expect(action).toContain("saveWoopEntry(");
    // The old shape: ask whether a WOOP exists, then branch on the answer in a
    // separate round trip. Both tabs answered "no".
    expect(action).not.toContain("const existingWoop = await getWoopByGoal(");
  });

  it("still reports created-vs-updated truthfully for the one-time event", () => {
    const code = source("lib/db/queries/woop.ts");

    expect(code).toContain('status: "created"');
    expect(code).toContain('status: "updated"');
  });

  it("has a database backstop authored, with its populated-DB precondition", () => {
    const migration = source("drizzle/0009_woop_one_row_per_goal.sql");

    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "woop_entries_goal_id_unique"');
    expect(migration).toContain("PRECONDITION");
    expect(migration).toContain("ROLLBACK");
    // It hard-deletes, which nothing else in this schema does — that has to be
    // stated where whoever applies it will read it.
    expect(migration).toContain("HARD DELETE");
  });
});

describe("GA-025: deleting a goal is one transaction", () => {
  const code = source("lib/db/queries/goals.ts");

  it("clears the focus pointer and the children in the same commit", () => {
    const body = code.slice(code.indexOf("export async function softDeleteGoal"));

    expect(body).toContain("db.transaction");
    expect(body).toContain("focusGoalId: null");
    expect(body).toContain("checklistItems");
    expect(body).toContain("checkins");
  });

  it("no longer leaves the focus release to the caller", () => {
    const action = source("lib/actions/goals.ts");
    const body = action.slice(action.indexOf("export async function softDeleteGoalAction"));
    const end = body.indexOf("export async function markAchieved");

    expect(body.slice(0, end)).not.toContain("clearFocusIfPointingAt");
  });
});
