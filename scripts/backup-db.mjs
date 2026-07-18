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
  const tableRows = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const tables = tableRows.map((r) => r.tablename);

  // Created only after the first query succeeds, so a failed connection
  // doesn't leave behind an empty backup-<timestamp>/ dir.
  const outdir = path.join(os.homedir(), "Backups", "goals-app", `backup-${timestamp()}`);
  fs.mkdirSync(outdir, { recursive: true });

  const manifestTables = [];
  let totalRows = 0;

  for (const table of tables) {
    const rows = await sql`SELECT * FROM ${sql(table)}`;
    fs.writeFileSync(
      path.join(outdir, `${table}.json`),
      JSON.stringify(rows, jsonReplacer, 2),
    );
    manifestTables.push({ name: table, rows: rows.length });
    totalRows += rows.length;
    console.log(`${table} → ${rows.length}`);
  }

  // Read-only bookkeeping probe: records whether drizzle-kit's migration
  // ledger exists yet. Absent is expected pre-migration and is not a
  // failure — the next task's apply-path decision branches on this.
  let drizzleMigrations = "absent";
  try {
    const rows = await sql`
      SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
    `;
    drizzleMigrations = rows.map((r) => ({
      id: r.id,
      hash: r.hash,
      created_at: r.created_at,
    }));
  } catch (err) {
    if (err && (err.code === "42P01" || err.code === "3F000")) {
      drizzleMigrations = "absent";
    } else {
      throw err;
    }
  }

  const manifest = {
    createdAtUtc: new Date().toISOString(),
    gitCommit: gitCommit(),
    tables: manifestTables,
    drizzleMigrations,
  };
  fs.writeFileSync(
    path.join(outdir, "manifest.json"),
    JSON.stringify(manifest, jsonReplacer, 2),
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
