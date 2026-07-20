#!/usr/bin/env node
// Logical JSON backup of the live Supabase Postgres DB.
//
// Growth-reactor doc v5 §10.1 mandates a verified backup before any schema
// migration. This machine has no pg_dump / psql / supabase CLI, so this
// dumps every table in the `public` schema to JSON using the app's existing
// `postgres` (postgres-js) driver (see lib/db/index.ts for the connection
// options this mirrors). Schema DDL is already versioned under drizzle/, so
// restore = migrations + re-insert from these JSON dumps.
//
// Usage: npm run db:backup   (loads DATABASE_URL via `node --env-file=.env`)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

function fail(message) {
  console.error(`backup-db: ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  fail("DATABASE_URL is not set. Aborting — nothing to back up.");
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

// postgres-js defaults int8/bigint columns to JS strings, but this guards
// against any value that does come back as a native BigInt (JSON.stringify
// throws on BigInt otherwise).
function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// Mirrors lib/db/index.ts connection options (prepare: false); max: 1 since
// this is a single short-lived script, not a pooled app server.
const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  // CR-029: every read below runs inside ONE `REPEATABLE READ READ ONLY`
  // transaction, so all tables are dumped from a single MVCC snapshot.
  // Previously each `SELECT *` ran autocommitted, meaning a write landing
  // mid-dump could put table A pre-change and table B post-change into the
  // same backup — e.g. a goal without its contributions, or contributions
  // referencing a goal that isn't in goals.json. That skew is silent and only
  // surfaces at restore time. This script runs immediately before schema
  // migrations, which is exactly when a corrupt backup is least survivable.
  //
  // READ ONLY is belt-and-braces: it makes the server reject any accidental
  // write from this script. `max: 1` means the pool has a single connection,
  // so there is no risk of a query escaping the transaction onto another one.
  const { outdir, manifestTables, totalRows, drizzleMigrations } = await sql.begin(
    "ISOLATION LEVEL REPEATABLE READ READ ONLY",
    async (tx) => {
      const tableRows = await tx`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `;
      const tables = tableRows.map((r) => r.tablename);

      // Created only after the first query succeeds, so a failed connection
      // doesn't leave behind an empty backup-<timestamp>/ dir.
      const dir = path.join(os.homedir(), "Backups", "goals-app", `backup-${timestamp()}`);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      const dumped = [];
      let rowCount = 0;

      for (const table of tables) {
        const rows = await tx`SELECT * FROM ${tx(table)}`;
        const json = JSON.stringify(rows, jsonReplacer, 2);
        // Hash the exact bytes written, so the manifest can be used to verify
        // a backup wasn't truncated or corrupted between now and a restore.
        const sha256 = crypto.createHash("sha256").update(json).digest("hex");
        fs.writeFileSync(path.join(dir, `${table}.json`), json, { mode: 0o600 });
        dumped.push({ name: table, rows: rows.length, bytes: Buffer.byteLength(json), sha256 });
        rowCount += rows.length;
        console.log(`${table} → ${rows.length}`);
      }

      // Read-only bookkeeping probe: records whether drizzle-kit's migration
      // ledger exists yet. Absent is expected pre-migration and is not a
      // failure — the next task's apply-path decision branches on this.
      //
      // Existence is checked with to_regclass rather than by catching the
      // "relation does not exist" error: inside a transaction that error would
      // abort the whole snapshot, taking the backup down with it.
      let migrations = "absent";
      const [probe] = await tx`SELECT to_regclass('drizzle.__drizzle_migrations') AS reg`;
      if (probe?.reg) {
        const rows = await tx`
          SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
        `;
        migrations = rows.map((r) => ({
          id: r.id,
          hash: r.hash,
          created_at: r.created_at,
        }));
      }

      return {
        outdir: dir,
        manifestTables: dumped,
        totalRows: rowCount,
        drizzleMigrations: migrations,
      };
    },
  );

  const manifest = {
    createdAtUtc: new Date().toISOString(),
    gitCommit: gitCommit(),
    // Recorded so a restore can tell a consistent snapshot apart from a dump
    // taken by an older version of this script.
    snapshot: "single REPEATABLE READ READ ONLY transaction",
    hashAlgorithm: "sha256",
    tables: manifestTables,
    drizzleMigrations,
  };
  fs.writeFileSync(
    path.join(outdir, "manifest.json"),
    JSON.stringify(manifest, jsonReplacer, 2),
    { mode: 0o600 },
  );

  console.log(`total rows: ${totalRows}`);
  console.log(`outdir: ${outdir}`);
}

main()
  .catch((err) => {
    console.error(`backup-db: query failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
