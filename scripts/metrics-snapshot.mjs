#!/usr/bin/env node
// Freezes one week's worth of "Приборы" (T2) numbers into an immutable file.
//
// T2's page (app/(app)/metrics/page.tsx) recomputes live on every open, so it
// can never prove what it showed a week ago. This script snapshots the same
// window into ~/Backups/goals-app/metrics/<YYYY>-Www.json, once per week,
// refusing to overwrite an existing snapshot without --force.
//
// growth-reactor A2 (task T3) — two hard requirements:
//   1. The frozen numbers must match what the live page would have shown for
//      that window — see the per-metric comments below, each tied to the
//      matching function in lib/metrics/definitions.ts (T2's contract).
//   2. The file must contain zero characters of user-authored text (goal
//      titles, notes, promises, reflections) — enforced at runtime by
//      assertNoUserText, not just by review, since it may end up in backups
//      or get shared.
//
// Why SQL, not an import of lib/metrics/definitions.ts: importing a .ts
// module (with its own "@/..." aliased imports) from a flat .mjs script run
// via `node --env-file=.env` is brittle on this Next/Node combination and
// would drag in build tooling this script has no business needing. Instead
// the contract is enforced by SNAPSHOT_KEYS being test-compared (as a set)
// against METRIC_KEYS — see tests/metrics-snapshot.test.ts. For the same
// reason, the Monday-anchored week-boundary helpers from
// lib/utils/week-keys.ts / lib/utils/date-keys.ts are duplicated below in
// plain JS rather than imported — keep them byte-for-byte equivalent to
// those modules if either changes.
//
// Usage: npm run metrics:snapshot -- [--week=YYYY-MM-DD] [--force]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

// --- Contract with lib/metrics/definitions.ts (task T2) --------------------
// Same 20 keys, same order — tests/metrics-snapshot.test.ts fails the build
// the moment these two lists disagree as sets.
export const SNAPSHOT_KEYS = [
  "completed_cycles",
  "completed_cycles_total",
  "promise_outcome_done",
  "promise_outcome_partial",
  "promise_outcome_skipped",
  "promise_outcome_unset",
  "checkin_coverage_days",
  "checkin_coverage_window_days",
  "checkin_coverage_ratio",
  "feeling_avg_done",
  "feeling_avg_partial",
  "feeling_avg_skipped",
  "if_then_structured",
  "if_then_total",
  "if_then_coverage_ratio",
  "orphan_promises",
  "promises_with_goal",
  "promises_total",
  "rolling_consistency_active",
  "rolling_consistency_window",
];

// The only keys allowed to carry a string value in the frozen object — every
// one of them is a piece of run metadata, never anything a user typed.
export const ALLOWED_TEXT_KEYS = ["week_start", "window_start", "generated_at_utc", "git_commit", "schema_version"];

/** Recursively walks `value`; throws if it finds a string under a key not in
 *  ALLOWED_TEXT_KEYS. Arrays are walked too — no key ever excuses a string
 *  found inside one, since none of the allowed service fields are arrays. */
export function assertNoUserText(value, pathLabel = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const itemPath = `${pathLabel}[${i}]`;
      if (typeof item === "string") {
        throw new Error(`assertNoUserText: string value found at ${itemPath}`);
      }
      assertNoUserText(item, itemPath);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const fieldPath = `${pathLabel}.${key}`;
      if (typeof v === "string") {
        if (!ALLOWED_TEXT_KEYS.includes(key)) {
          throw new Error(`assertNoUserText: string value found at ${fieldPath} (key "${key}" is not allowed to carry text)`);
        }
        continue;
      }
      assertNoUserText(v, fieldPath);
    }
  }
}

// --- Local re-implementations of lib/utils/date-keys.ts / week-keys.ts -----
// (kept deliberately tiny and literal copies — see file header)

function toDateKeyUTC(date) {
  return date.toISOString().slice(0, 10);
}

function weekStartKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toDateKeyUTC(date);
}

function previousWeekKey(weekKey) {
  const [y, m, d] = weekKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 7));
  return toDateKeyUTC(date);
}

function addDaysToKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return toDateKeyUTC(new Date(Date.UTC(y, m - 1, d + days)));
}

function isMonday(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return toDateKeyUTC(date) === key && date.getUTCDay() === 1;
}

/** ISO-8601 week-year and week-number for a Monday-anchored date key
 *  (standard "Thursday of this week decides the ISO year" algorithm). */
function isoWeek(mondayKey) {
  const [y, m, d] = mondayKey.split("-").map(Number);
  const thursday = new Date(Date.UTC(y, m - 1, d + 3));
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(Date.UTC(isoYear, 0, 4 - jan4DayNum));
  const weekNum = Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return { isoYear, weekNum };
}

const WINDOW_WEEKS = 8;
// Version of THIS snapshot file's own JSON shape — bump only if the shape
// (not the numbers) changes, so an old frozen file can be told apart from a
// new one at restore/read time.
const SCHEMA_VERSION = "1";

function fail(message) {
  console.error(`metrics-snapshot: ${message}`);
  process.exit(1);
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  let week = null;
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("--week=")) {
      const value = arg.slice("--week=".length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isMonday(value)) {
        fail(`--week must be a Monday in YYYY-MM-DD form, got "${value}"`);
      }
      week = value;
    } else {
      fail(`unknown flag "${arg}" (expected --week=YYYY-MM-DD and/or --force)`);
    }
  }
  return { week, force };
}

async function main() {
  const { week, force } = parseArgs(process.argv.slice(2));

  // Decision 3 (T3 spec): default target is the last COMPLETED week (the one
  // before today's), never the still-open current week. --week overrides.
  const targetWeek = week ?? previousWeekKey(weekStartKey(toDateKeyUTC(new Date())));

  // Decision 3 also means every week in this window is, by construction, a
  // fully elapsed week (including the target) — unlike the live page, this
  // script never needs lib/metrics/definitions.ts's partial-current-week
  // denominator (checkinCoverage's `daysInWeek` branch): every week here
  // gets the full 7-day denominator.
  const weekStarts = [];
  {
    let cursor = targetWeek;
    for (let i = 0; i < WINDOW_WEEKS; i++) {
      weekStarts.unshift(cursor);
      cursor = previousWeekKey(cursor);
    }
  }
  const windowStart = weekStarts[0];
  const windowEnd = addDaysToKey(targetWeek, 7); // exclusive — first day of the week AFTER the target week

  const { isoYear, weekNum } = isoWeek(targetWeek);
  const fileName = `${isoYear}-W${String(weekNum).padStart(2, "0")}.json`;
  const outDir = path.join(os.homedir(), "Backups", "goals-app", "metrics");
  const outPath = path.join(outDir, fileName);

  if (fs.existsSync(outPath) && !force) {
    fail(`срез недели ${targetWeek} уже заморожен: ${outPath}; перезапись только с --force`);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    fail("DATABASE_URL is not set. Aborting — nothing to read.");
  }

  // Mirrors scripts/backup-db.mjs: single short-lived connection, no
  // prepared statements, all reads inside one REPEATABLE READ READ ONLY
  // transaction so every metric is computed from the same MVCC snapshot.
  const sql = postgres(connectionString, { max: 1, prepare: false });

  let metrics;
  let readError = null;
  try {
    metrics = await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
      // T11 review: every read on the live page goes through
      // lib/db/queries/metrics.ts, which scopes by userId. This script had no
      // user filter at all, so the two would silently diverge the moment a
      // second row appeared in `users` — and Supabase sign-ups are still open
      // (owner task E1). The app is single-user by construction
      // (getCurrentUser always returns the owner), so the honest fix is to
      // scope by that one user and refuse to guess if there is ever more than
      // one: a snapshot mixing two people's weeks is worse than no snapshot.
      const owners = await tx`SELECT id FROM users`;
      if (owners.length !== 1) {
        throw new Error(
          `ожидался ровно один пользователь в таблице users, найдено ${owners.length} — ` +
            `срез не может выбрать владельца и остановлен`,
        );
      }
      const ownerId = owners[0].id;

      // Reflections: matches lib/metrics/definitions.ts's completedCycles /
      // promiseOutcomeMix / orphanPromises. No deleted_at column on this
      // table (schema.ts) — nothing to filter there.
      const [reflectionRow] = await tx`
        SELECT
          COUNT(*)::int AS completed_cycles_total,
          COUNT(*) FILTER (WHERE prev_outcome IS NOT NULL)::int AS completed_cycles,
          COUNT(*) FILTER (WHERE prev_outcome = 'done')::int AS promise_outcome_done,
          COUNT(*) FILTER (WHERE prev_outcome = 'partial')::int AS promise_outcome_partial,
          COUNT(*) FILTER (WHERE prev_outcome = 'skipped')::int AS promise_outcome_skipped,
          COUNT(*) FILTER (WHERE prev_outcome IS NULL)::int AS promise_outcome_unset,
          COUNT(*) FILTER (WHERE promise IS NOT NULL AND promise <> '' AND promise_goal_id IS NULL)::int AS orphan_promises,
          COUNT(*) FILTER (WHERE promise IS NOT NULL AND promise <> '' AND promise_goal_id IS NOT NULL)::int AS promises_with_goal
        FROM reflections
        WHERE user_id = ${ownerId}
          AND week_start >= ${windowStart}::date AND week_start < ${windowEnd}::date
      `;

      // Check-ins: matches checkinCoverage (distinct dates) and
      // feelingByOutcome. Soft-deleted check-ins and check-ins under
      // soft-deleted goals are excluded, same join idiom as
      // lib/db/queries/metrics.ts.
      const [checkinRow] = await tx`
        SELECT
          COUNT(DISTINCT c.date)::int AS checkin_coverage_days,
          COALESCE(AVG(c.feeling) FILTER (WHERE c.outcome = 'done'), 0)::float8 AS feeling_avg_done,
          COALESCE(AVG(c.feeling) FILTER (WHERE c.outcome = 'partial'), 0)::float8 AS feeling_avg_partial,
          COALESCE(AVG(c.feeling) FILTER (WHERE c.outcome = 'skipped'), 0)::float8 AS feeling_avg_skipped
        FROM checkins c
        JOIN goals g ON g.id = c.goal_id
        WHERE g.user_id = ${ownerId}
          AND c.deleted_at IS NULL AND g.deleted_at IS NULL
          AND c.date >= ${windowStart}::date AND c.date < ${windowEnd}::date
      `;

      // Active weeks (check-in OR reflection) for rollingConsistency — the
      // union is deduplicated by week_start via UNION (not UNION ALL).
      const [activeRow] = await tx`
        SELECT COUNT(DISTINCT week_start)::int AS active_weeks
        FROM (
          SELECT date_trunc('week', c.date)::date AS week_start
          FROM checkins c
          JOIN goals g ON g.id = c.goal_id
          WHERE g.user_id = ${ownerId}
            AND c.deleted_at IS NULL AND g.deleted_at IS NULL
            AND c.date >= ${windowStart}::date AND c.date < ${windowEnd}::date
          UNION
          SELECT r.week_start
          FROM reflections r
          WHERE r.user_id = ${ownerId}
            AND r.week_start >= ${windowStart}::date AND r.week_start < ${windowEnd}::date
        ) active
      `;

      // Checklist if-then coverage: matches ifThenCoverage, which (per T2
      // Step 2's decision, restated in lib/metrics/definitions.ts) is NOT
      // window-bound — it's every live step under every live goal, right now.
      const [checklistRow] = await tx`
        SELECT
          COUNT(*)::int AS if_then_total,
          COUNT(*) FILTER (WHERE ci.if_then IS NOT NULL)::int AS if_then_structured
        FROM checklist_items ci
        JOIN goals g ON g.id = ci.goal_id
        WHERE g.user_id = ${ownerId}
          AND ci.deleted_at IS NULL AND g.deleted_at IS NULL
      `;

      return { reflectionRow, checkinRow, activeRow, checklistRow };
    });
  } catch (error) {
    // Captured rather than re-thrown so the connection still closes below —
    // process.exit() inside a catch skips the finally block.
    readError = error;
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (readError) fail(readError instanceof Error ? readError.message : String(readError));

  const { reflectionRow, checkinRow, activeRow, checklistRow } = metrics;

  const checkinCoverageWindowDays = WINDOW_WEEKS * 7;
  const promisesTotal = reflectionRow.orphan_promises + reflectionRow.promises_with_goal;
  const ifThenCoverageRatio = checklistRow.if_then_total === 0 ? 0 : checklistRow.if_then_structured / checklistRow.if_then_total;

  const result = {
    week_start: targetWeek,
    window_start: windowStart,
    generated_at_utc: new Date().toISOString(),
    git_commit: gitCommit(),
    schema_version: SCHEMA_VERSION,

    completed_cycles: reflectionRow.completed_cycles,
    completed_cycles_total: reflectionRow.completed_cycles_total,
    promise_outcome_done: reflectionRow.promise_outcome_done,
    promise_outcome_partial: reflectionRow.promise_outcome_partial,
    promise_outcome_skipped: reflectionRow.promise_outcome_skipped,
    promise_outcome_unset: reflectionRow.promise_outcome_unset,
    checkin_coverage_days: checkinRow.checkin_coverage_days,
    checkin_coverage_window_days: checkinCoverageWindowDays,
    checkin_coverage_ratio: checkinCoverageWindowDays === 0 ? 0 : checkinRow.checkin_coverage_days / checkinCoverageWindowDays,
    feeling_avg_done: checkinRow.feeling_avg_done,
    feeling_avg_partial: checkinRow.feeling_avg_partial,
    feeling_avg_skipped: checkinRow.feeling_avg_skipped,
    if_then_structured: checklistRow.if_then_structured,
    if_then_total: checklistRow.if_then_total,
    if_then_coverage_ratio: ifThenCoverageRatio,
    orphan_promises: reflectionRow.orphan_promises,
    promises_with_goal: reflectionRow.promises_with_goal,
    promises_total: promisesTotal,
    rolling_consistency_active: activeRow.active_weeks,
    rolling_consistency_window: WINDOW_WEEKS,
  };

  // Runtime guard, not just review (T3 Decision 5): must not write a single
  // character of user text into a file destined for backups.
  assertNoUserText(result);

  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), { mode: 0o600 });

  console.log(`snapshot written: ${outPath}`);
  for (const key of SNAPSHOT_KEYS) {
    console.log(`${key}: ${result[key]}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
