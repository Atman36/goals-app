import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_COOKIE,
  cookieValueForToken,
  configuredToken,
  isGateEnabled,
  isValidCookie,
  isValidToken,
} from "@/lib/access";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Invariants closed on 2026-07-25 from the Opus review of the audit-fix passes:
 * the residuals of GA-016, GA-025, GA-014, GA-012 and GA-013, plus the newly
 * closed GA-009 and GA-021, plus the deployment token gate.
 */

describe("CURRENCY-001: a contribution cannot be reinterpreted by a concurrent currency edit (GA-016)", () => {
  it("compares the caller's currency against the LOCKED goal row", () => {
    const query = source("lib/db/queries/contributions.ts");

    expect(query).toContain("expectedCurrency");
    // The comparison must read the goal handed back by withLockedLiveGoal, not a
    // value fetched before the lock.
    expect(query).toMatch(/withLockedLiveGoal\([^)]*async \(tx, goal\)/);
    expect(query).toContain("goal.currency !== expectedCurrency");
    expect(query).toContain('status: "currency_changed"');
  });

  it("stays idempotent: a replay of an already-stored contribution is not refused at the check", () => {
    const query = source("lib/db/queries/contributions.ts");

    const guardIndex = query.indexOf("goal.currency !== expectedCurrency");
    const replayIndex = query.indexOf("eq(contributions.id, values.id)");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(replayIndex).toBeGreaterThan(guardIndex);
    expect(query).toContain("if (!already) return { currencyChanged: true as const, row: null }");
  });

  it("the write route passes the currency it priced the amount in, and answers 409", () => {
    const route = source("app/api/v1/goals/[goalId]/contributions/route.ts");

    expect(route).toContain("expectedCurrency: goal.currency");
    expect(route).toContain('const GOAL_CURRENCY_CHANGED = "goal_currency_changed"');
    expect(route).toContain('result.status === "currency_changed"');
  });

  it("the client recognises the same code string", () => {
    const client = source("components/goals/quick-add-sheet.tsx");

    expect(client).toContain('const GOAL_CURRENCY_CHANGED = "goal_currency_changed"');
    expect(client).toContain('"currency_changed"');
  });
});

describe("CHECKIN: the goal's active status is re-read under the lock", () => {
  it("upsertCheckinRow refuses a goal that stopped being active", () => {
    const query = source("lib/db/queries/checkins.ts");

    expect(query).toMatch(/withLockedLiveGoal\([^)]*async \(tx, goal\)/);
    expect(query).toContain('if (goal.status !== "active") return null;');
  });
});

describe("SOFT-DELETE-001: leaving 'active' releases the focus pointer atomically (GA-025)", () => {
  it("setGoalStatus clears focus in its own transaction, conditionally", () => {
    const query = source("lib/db/queries/goals.ts");

    const statusIndex = query.indexOf("export async function setGoalStatus");
    const body = query.slice(statusIndex);
    expect(body).toContain("db.transaction(");
    expect(body).toContain('status !== "active"');
    // Conditional: the pointer is only cleared when it still names this goal.
    expect(body).toContain("eq(users.focusGoalId, goalId)");
  });

  it("the actions no longer clear focus from a value read before the write", () => {
    const action = source("lib/actions/goals.ts");

    expect(action).not.toContain("clearFocusIfPointingAt");
    expect(action).not.toContain("setUserFocusGoal");
  });
});

describe("MEDIA-001: a media row may not bind two unrelated parents (GA-009)", () => {
  it("when both parents are named, the comment is verified to belong to that goal", () => {
    const query = source("lib/db/queries/media.ts");

    expect(query).toContain("if (values.goalId && values.commentId)");
    expect(query).toContain("eq(comments.goalId, goalId)");
    expect(query).toContain("isNull(comments.deletedAt)");
    // Verified under the goal's lock, so the lock order stays goals-first.
    const branchIndex = query.indexOf("if (values.goalId && values.commentId)");
    const lockIndex = query.indexOf("withLockedLiveGoal", branchIndex);
    const checkIndex = query.indexOf("eq(comments.goalId, goalId)", branchIndex);
    expect(lockIndex).toBeGreaterThan(branchIndex);
    expect(checkIndex).toBeGreaterThan(lockIndex);
  });
});

describe("MEDIA-003: the 50-image quota is enforced under the goal lock (GA-021)", () => {
  it("insertMediaItem counts inside the locked transaction and can refuse", () => {
    const query = source("lib/db/queries/media.ts");

    expect(query).toContain('{ status: "quota_exceeded" }');
    expect(query).toContain("options: { maxPerGoal?: number }");
    // The count must go through the transaction handle, never the module-level db.
    const insertIndex = query.indexOf("export async function insertMediaItem");
    const body = query.slice(insertIndex);
    expect(body).toContain("select({ value: count() })");
    expect(body.slice(0, body.indexOf("select({ value: count() })"))).toContain("await tx");
  });

  it("a replay of an already-registered path is exempt from the cap", () => {
    const query = source("lib/db/queries/media.ts");

    expect(query).toContain("alreadyRegistered");
    expect(query).toContain("if (!alreadyRegistered) {");
  });

  it("the action passes the cap down and reports the refusal", () => {
    const action = source("lib/actions/media.ts");

    expect(action).toContain("{ maxPerGoal: MAX_MEDIA_PER_GOAL }");
    expect(action).toContain('inserted.status === "quota_exceeded"');
  });
});

describe("MONEY-001: the edit form's defaults never round-trip through a double (GA-014)", () => {
  it("goal-form pre-fills amounts with the exact string converter", () => {
    const form = source("components/goals/goal-form.tsx");

    expect(form).toContain("toMajorUnitsString(props.goal.targetAmount)");
    expect(form).toContain("toMajorUnitsString(props.goal.initialAmount)");
    // The lossy display-only converter must not be reachable from this file at all.
    expect(form).not.toContain("String(toMajorUnits(");
    expect(form).not.toContain("import { toMajorUnits }");
  });
});

describe("stale-write recovery actually recovers (GA-012, GA-013)", () => {
  it("the edit page remounts the form when the goal's version changes", () => {
    const page = source("app/(app)/goals/[goalId]/edit/page.tsx");

    expect(page).toContain("key={goal.updatedAt.toISOString()}");
  });

  // The daily loop moved from /today to the home page; the GA-013 invariant
  // moved with it. /today is now a permanentRedirect, so this guard has to
  // follow the card, not the route it used to live on.
  it("the home page remounts the check-in card when the day changes", () => {
    const page = source("app/(app)/page.tsx");

    expect(page).toContain("key={today}");
  });

  it("/today is a redirect and no longer renders the check-in itself", () => {
    const page = source("app/(app)/today/page.tsx");

    expect(page).toContain("permanentRedirect");
    expect(page).not.toContain("<CheckinCard");
  });
});

describe("deployment token gate", () => {
  const original = process.env.APP_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.APP_ACCESS_TOKEN = "s3cret-token";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.APP_ACCESS_TOKEN;
    else process.env.APP_ACCESS_TOKEN = original;
  });

  it("is off when no token is configured, and refuses everything while off", () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(isGateEnabled()).toBe(false);
    expect(configuredToken()).toBeNull();
    // Fail closed: with no configured secret nothing can be "valid".
    expect(isValidToken("anything")).toBe(false);
    expect(isValidCookie("anything")).toBe(false);
  });

  it("treats an empty or whitespace-only token as not configured", () => {
    process.env.APP_ACCESS_TOKEN = "   ";
    expect(isGateEnabled()).toBe(false);
  });

  it("accepts the configured token and rejects near misses", () => {
    expect(isValidToken("s3cret-token")).toBe(true);
    expect(isValidToken("s3cret-toke")).toBe(false);
    expect(isValidToken("s3cret-tokenn")).toBe(false);
    expect(isValidToken("S3CRET-TOKEN")).toBe(false);
    expect(isValidToken("")).toBe(false);
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });

  it("tolerates whitespace pasted around the token by an env editor", () => {
    process.env.APP_ACCESS_TOKEN = "  s3cret-token\n";
    expect(isValidToken("s3cret-token")).toBe(true);
    expect(isValidToken(" s3cret-token ")).toBe(true);
  });

  it("stores a digest in the cookie, never the token itself", () => {
    const value = cookieValueForToken("s3cret-token");

    expect(value).not.toContain("s3cret-token");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(isValidCookie(value)).toBe(true);
  });

  it("rejects malformed or foreign cookie values without throwing", () => {
    expect(isValidCookie("not-hex")).toBe(false);
    expect(isValidCookie("")).toBe(false);
    expect(isValidCookie(cookieValueForToken("another-token"))).toBe(false);
    // A raw token in the cookie slot must not pass — the cookie carries a digest.
    expect(isValidCookie("s3cret-token")).toBe(false);
  });

  it("proxy.ts gates by cookie, strips the token from the URL, and never redirects APIs", () => {
    const proxy = source("proxy.ts");

    expect(proxy).toContain("export function proxy");
    expect(proxy).toContain("if (!isGateEnabled()) return NextResponse.next()");
    expect(proxy).toContain("cleanUrl.searchParams.delete(ACCESS_QUERY_PARAM)");
    expect(proxy).toContain("httpOnly: true");
    expect(proxy).toContain('nextUrl.pathname.startsWith("/api/")');
    expect(proxy).toContain("ACCESS_COOKIE");
    expect(ACCESS_COOKIE).toBe("ga_access");
  });

  it("the unlock page re-checks the token itself rather than trusting the proxy", () => {
    const page = source("app/unlock/page.tsx");

    expect(page).toContain('"use server"');
    expect(page).toContain("if (!isGateEnabled()) redirect");
    expect(page).toContain("isValidToken(token)");
    // No open redirect through ?next=
    expect(page).toContain("function safeNextPath");
    expect(page).toContain('value.startsWith("//")');
  });
});

describe("MIGRATION-001: the ledger is the only statement of applied state (GA-023)", () => {
  it("applying a migration writes its ledger row in the same transaction", () => {
    const runner = source("scripts/apply-migration.mjs");

    expect(runner).toContain("await sql.begin(");
    expect(runner).toContain("INSERT INTO manual_migration_ledger");
    // A file that opens its own transaction would break that guarantee.
    expect(runner).toContain("assertNoOwnTransaction");
    // Re-applying an edited file must be refused, not silently re-run.
    expect(runner).toContain("Applied migrations are immutable");
  });

  it("the status gate blocks on a changed or unknown file", () => {
    const gate = source("scripts/migration-status.mjs");

    expect(gate).toContain("CHANGED");
    expect(gate).toContain("UNKNOWN");
    expect(gate).toContain("process.exitCode = 2");
  });

  it("stale 'not applied' headers were replaced by a pointer at the ledger", () => {
    const migration = source("drizzle/0008_revoke_postgrest_dml.sql");

    expect(migration).not.toContain("НЕ ПРИМЕНЕНА.");
    expect(migration).toContain("manual_migration_ledger");
  });

  it("the ledger table is closed to the PostgREST roles", () => {
    const migration = source("drizzle/0010_migration_ledger.sql");

    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
});

describe("RLS-002: new tables are not readable by API roles by default (GA-006)", () => {
  it("0012 revokes SELECT as well as DML, for present and future objects", () => {
    const migration = source("drizzle/0012_default_acl_hardening.sql");

    expect(migration).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated");
    expect(migration).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public");
    expect(migration).toContain("REVOKE ALL ON TABLES FROM anon, authenticated");
    // The supabase_admin branch must be conditional — the executing role is not
    // necessarily a member, and an unconditional attempt aborts the migration.
    expect(migration).toContain("pg_has_role(current_user, 'supabase_admin', 'MEMBER')");
    expect(migration).toContain("RAISE NOTICE");
  });
});

describe("SOFT-DELETE-002: the goal cascade reaches every child it can (probe A13)", () => {
  it("softDeleteGoal closes woop_entries too, and comment-attached media", () => {
    const query = source("lib/db/queries/goals.ts");

    const deleteIndex = query.indexOf("export async function softDeleteGoal");
    const body = query.slice(deleteIndex, query.indexOf("export", deleteIndex + 10));

    // T16 FIX-2: this used to pin the array's tail — `toContain("checkins,
    // woopEntries]")` — which only held while woopEntries was the newest child.
    // planAdjustments (drizzle/0014) joined the cascade, so the tail moved. Assert
    // every member of the loop's array by name instead, scoped to the array text
    // so a name mentioned elsewhere in the body cannot satisfy it: seven members
    // asserted where two were, and it no longer goes stale on the next child.
    const cascadeStart = body.indexOf("for (const child of [");
    const cascade = body.slice(cascadeStart, body.indexOf("]", cascadeStart) + 1);
    for (const child of [
      "contributions",
      "checklistItems",
      "comments",
      "mediaItems",
      "checkins",
      "woopEntries",
      "planAdjustments",
    ]) {
      expect(cascade, `${child} missing from softDeleteGoal's cascade`).toContain(child);
    }

    // Comment media carries no goalId, so the loop cannot see it.
    expect(body).toContain("eq(comments.goalId, goalId)");
    expect(body).toContain("eq(comments.id, mediaItems.commentId)");
    // goal_revisions stays out on purpose: append-only history outlives its goal.
    expect(body).not.toContain("goalRevisions");
  });

  it("WOOP reads exclude soft-deleted rows", () => {
    const query = source("lib/db/queries/woop.ts");

    const occurrences = query.match(/isNull\(woopEntries\.deletedAt\)/g) ?? [];
    // saveWoopEntry, getWoopByGoal and touchWoopLived each filter.
    expect(occurrences.length).toBe(3);
  });
});

describe("SOFT-DELETE-002: woop_entries can be closed with its goal (probe A13)", () => {
  it("0011 adds the column and makes the uniqueness partial", () => {
    const migration = source("drizzle/0011_woop_soft_delete_and_orphan_cleanup.sql");

    expect(migration).toContain('ALTER TABLE "woop_entries" ADD COLUMN IF NOT EXISTS "deleted_at"');
    expect(migration).toContain('DROP INDEX IF EXISTS "woop_entries_goal_id_unique"');
    expect(migration).toContain('WHERE "deleted_at" IS NULL');
    // The one-time cleanup stamps the parent's timestamp, never now().
    expect(migration).toContain('SET "deleted_at" = g."deleted_at"');
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});
