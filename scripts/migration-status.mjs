#!/usr/bin/env node
/**
 * Release gate for direct-SQL migration state (GA-023, GA-031 / SPEC-15).
 *
 *   node --env-file=.env scripts/migration-status.mjs
 *
 * Compares every drizzle/*.sql file against `public.manual_migration_ledger` and
 * exits non-zero when the two disagree in a way that must block a release:
 *
 *   CHANGED  — an applied file was edited after the fact (its sha256 moved).
 *   UNKNOWN  — the ledger names a file that no longer exists in the repository.
 *
 * PENDING (a file with no ledger row) is reported but does not fail: an authored,
 * not-yet-applied migration is a legitimate state.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (run with `node --env-file=.env`)");
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      filename: `drizzle/${name}`,
      sha256: createHash("sha256").update(readFileSync(join(MIGRATIONS_DIR, name))).digest("hex"),
    }));

  const sql = postgres(url, { max: 1, connect_timeout: 20, prepare: false });
  let rows;
  try {
    const exists = (await sql`SELECT to_regclass('public.manual_migration_ledger') AS t`)[0].t;
    if (!exists) {
      console.error("BLOCKED: manual_migration_ledger does not exist — apply drizzle/0010_migration_ledger.sql");
      process.exitCode = 2;
      return;
    }
    rows = await sql`SELECT filename, sha256, applied_at, transaction_status FROM manual_migration_ledger`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const ledger = new Map(rows.map((r) => [r.filename, r]));
  const problems = [];

  for (const file of files) {
    const row = ledger.get(file.filename);
    if (!row) {
      console.log(`PENDING  ${file.filename}`);
      continue;
    }
    if (row.sha256 !== file.sha256) {
      console.log(`CHANGED  ${file.filename}  (ledger ${row.sha256.slice(0, 12)}… vs file ${file.sha256.slice(0, 12)}…)`);
      problems.push(file.filename);
      continue;
    }
    console.log(`OK       ${file.filename}  (${row.transaction_status}, ${row.applied_at.toISOString().slice(0, 10)})`);
  }

  const known = new Set(files.map((f) => f.filename));
  for (const filename of ledger.keys()) {
    if (!known.has(filename)) {
      console.log(`UNKNOWN  ${filename}  (in ledger, missing from repository)`);
      problems.push(filename);
    }
  }

  if (problems.length > 0) {
    console.error(`\nBLOCKED: ${problems.length} migration file(s) disagree with the ledger.`);
    process.exitCode = 2;
  } else {
    console.log(`\nledger consistent: ${files.length} file(s) checked`);
  }
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 2;
});
