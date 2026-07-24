#!/usr/bin/env node
/**
 * Apply one direct-SQL migration and record it in `public.manual_migration_ledger`
 * atomically (GA-023 / SPEC-15).
 *
 * This repository cannot use `drizzle-kit migrate` or `db:push` — see
 * drizzle/0010_migration_ledger.sql for why. This script is the only supported
 * application path.
 *
 *   node --env-file=.env scripts/apply-migration.mjs drizzle/0011_foo.sql
 *   node --env-file=.env scripts/apply-migration.mjs drizzle/0011_foo.sql --dry-run
 *   node --env-file=.env scripts/apply-migration.mjs drizzle/0008_x.sql --backfill --evidence='{"probe":"A02"}'
 *
 * Guarantees:
 *  - the migration statements and the ledger row commit in ONE transaction, so a
 *    failed migration cannot be marked applied;
 *  - a file already in the ledger is refused (idempotent no-op if the hash matches,
 *    hard error if the file changed since it was applied);
 *  - files containing their own BEGIN/COMMIT are refused, because they would break
 *    that single-transaction guarantee.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import postgres from "postgres";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      flags[key] = rest.length > 0 ? rest.join("=") : true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/**
 * Reject files that manage their own transaction. The ledger row must commit with
 * the migration; a nested COMMIT would sever the two.
 */
function assertNoOwnTransaction(sqlText, filename) {
  const withoutComments = sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  // Match transaction-control STATEMENTS only: `BEGIN;`, `COMMIT WORK;`, `START TRANSACTION`.
  // A bare `BEGIN` opening a PL/pgSQL block is not followed by a semicolon, so DO blocks —
  // which migrations legitimately use for conditional DDL — are not caught here.
  const offender = /\b(BEGIN|COMMIT|ROLLBACK)\s*(?:WORK|TRANSACTION)?\s*;|\bSTART\s+TRANSACTION\b/i.exec(
    withoutComments,
  );
  if (offender) {
    throw new Error(
      `${filename} contains its own transaction control (${offender[0].trim()}). ` +
        `Remove it — this script wraps the file in a single transaction.`,
    );
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const target = positional[0];
  if (!target) {
    console.error("usage: apply-migration.mjs <path/to/migration.sql> [--dry-run] [--backfill] [--backup-id=<id>] [--evidence=<json>]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (run with `node --env-file=.env`)");
    process.exit(1);
  }

  const absolute = resolve(REPO_ROOT, target);
  const filename = relative(REPO_ROOT, absolute);
  const bytes = readFileSync(absolute);
  const sqlText = bytes.toString("utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const backfill = Boolean(flags.backfill);
  const status = backfill ? "backfilled" : "applied";
  const backupId = typeof flags["backup-id"] === "string" ? flags["backup-id"] : null;
  let evidence = {};
  if (typeof flags.evidence === "string") {
    evidence = JSON.parse(flags.evidence);
  }

  if (!backfill) assertNoOwnTransaction(sqlText, filename);

  console.log(`file    : ${filename}`);
  console.log(`sha256  : ${sha256}`);
  console.log(`mode    : ${backfill ? "BACKFILL (file is NOT executed)" : "APPLY"}`);
  if (backupId) console.log(`backup  : ${backupId}`);

  if (flags["dry-run"]) {
    console.log("dry run — nothing sent to the database");
    return;
  }

  const sql = postgres(url, { max: 1, connect_timeout: 20, prepare: false });
  try {
    const ledgerExists = (await sql`SELECT to_regclass('public.manual_migration_ledger') AS t`)[0].t;
    if (ledgerExists) {
      const [existing] = await sql`
        SELECT sha256, applied_at, transaction_status
        FROM manual_migration_ledger WHERE filename = ${filename}`;
      if (existing) {
        if (existing.sha256 === sha256) {
          console.log(`already recorded (${existing.transaction_status} at ${existing.applied_at.toISOString()}) — nothing to do`);
          return;
        }
        throw new Error(
          `${filename} is recorded with sha256 ${existing.sha256} but the file now hashes to ${sha256}. ` +
            `Applied migrations are immutable — write a new migration instead.`,
        );
      }
    } else if (backfill) {
      throw new Error("ledger table does not exist yet — apply drizzle/0010_migration_ledger.sql first");
    }

    await sql.begin(async (tx) => {
      if (!backfill) {
        await tx.unsafe(sqlText);
      }
      await tx`
        INSERT INTO manual_migration_ledger
          (filename, sha256, backup_id, transaction_status, evidence)
        VALUES
          (${filename}, ${sha256}, ${backupId}, ${status}, ${sql.json(evidence)})`;
    });

    console.log(`OK — ${filename} ${backfill ? "recorded as backfilled" : "applied and recorded"}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 2;
});
