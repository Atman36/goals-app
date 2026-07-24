-- 0010 — authoritative ledger for manually applied SQL migrations (GA-023, GA-031 / SPEC-15)
--
-- WHY. This project cannot use `drizzle-kit migrate` / `db:push`: the live database has no
-- `drizzle.__drizzle_migrations` table, and `db:generate` crashes on a bigint default. Every
-- migration since 0002 has been applied by hand. Until now the only record of *what had been
-- applied* was a prose comment in the file header — and those headers went stale (0007 and 0008
-- still said "NOT APPLIED" months after they were applied). A comment cannot be queried, cannot
-- be verified, and cannot block a release.
--
-- CONTRACT. From this migration on, applied state is defined by rows in this table plus a sha256
-- of the file that produced them. Comments may explain a migration; they never define its state.
-- `scripts/apply-migration.mjs` inserts the row INSIDE the same transaction as the migration
-- statements, so a failed migration cannot leave a row claiming success.
--
-- PRECONDITION (populated database): none. Creates one new table, touches no existing data.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.manual_migration_ledger;

CREATE TABLE IF NOT EXISTS "manual_migration_ledger" (
  -- Path relative to the repository root, e.g. 'drizzle/0009_woop_one_row_per_goal.sql'.
  "filename" text PRIMARY KEY,
  -- sha256 of the file's exact bytes at application time. A later edit to an applied file is a
  -- release-blocking mismatch, not a silent rewrite of history.
  "sha256" text NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  -- Database role that executed it, captured server-side rather than supplied by the client.
  "applied_by" text NOT NULL DEFAULT current_user,
  -- Directory name under ~/Backups/goals-app taken immediately before application.
  "backup_id" text,
  -- 'applied'    — this ledger row and the migration statements committed together.
  -- 'backfilled' — the migration predates the ledger; applied state was established from
  --                observed database effects, recorded in `evidence`.
  "transaction_status" text NOT NULL,
  -- Free-form verification record: what proved the migration took effect.
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "manual_migration_ledger_status_check"
    CHECK ("transaction_status" IN ('applied', 'backfilled'))
);--> statement-breakpoint

-- Deny-first, per security/RLS_ACTIVATION_ORDER.md. Tables created by `postgres` in this schema
-- inherit SELECT for anon/authenticated from pg_default_acl (see 0012) — this table must never be
-- exposed on the PostgREST surface, so revoke explicitly rather than relying on the default fix.
REVOKE ALL ON TABLE "manual_migration_ledger" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "manual_migration_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- No policies are created: with RLS on and zero policies, every non-owner role sees zero rows
-- even if a grant is restored by mistake later.
