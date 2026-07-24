-- 0012 — deny-first privileges for the PostgREST roles, present and future (GA-006 / SPEC-17)
--         invariants RLS-002 · MIGRATION-001
--
-- WHY. Migration 0008 revoked INSERT/UPDATE/DELETE/TRUNCATE from `anon` and `authenticated` on
-- the eleven tables that existed at the time, and set ALTER DEFAULT PRIVILEGES so future tables
-- would not inherit those four. Two holes remained, both confirmed by reading pg_default_acl on
-- the live project on 2026-07-25:
--
--   1. SELECT was never included. The default ACL for tables created by `postgres` in schema
--      public still reads `anon=rxtm/postgres` — every NEW table is world-readable through the
--      REST API from the moment it is created, before anyone thinks about RLS. Stage 1 adds
--      circles, invitations and publications; the first of those tables would have been readable
--      by an anonymous HTTP request until someone remembered to close it.
--   2. `arwdDxtm` (full DML, including INSERT/UPDATE/DELETE) is the default for tables created by
--      role `supabase_admin`. 0008 could not affect that: ALTER DEFAULT PRIVILEGES only ever
--      applies to one creator role, and `postgres` is not a member of `supabase_admin` on this
--      project, so it cannot alter that role's defaults at all. Step 3 attempts it and records
--      what happened instead of pretending it succeeded.
--
-- Residual grants on EXISTING tables are also cleared (step 1). What is left there today is
-- `x t m` — REFERENCES, TRIGGER, MAINTAIN — plus SELECT on fx_rates. TRIGGER in particular lets a
-- grantee attach a trigger to a table it cannot otherwise write. None of it is used: the
-- application connects through postgres-js as the table owner (lib/db/index.ts), and the only
-- browser-side Supabase call is `storage.from('media')` (lib/storage.ts, components/goals/*),
-- which is the Storage API and not the public schema. Verified by search before writing this.
--
-- Stage 1 note: when a table is genuinely meant to be reachable over REST, grant it explicitly
-- to that one table AFTER enabling and forcing RLS and creating its policies — never by
-- restoring a schema-wide default. That is the order in security/RLS_ACTIVATION_ORDER.md.
--
-- PRECONDITION (populated database): none — privileges only, no data is read or written.
--
-- ROLLBACK (restores the pre-0012 state; only meaningful if PostgREST access is ever wanted):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   GRANT SELECT ON TABLE public.fx_rates TO anon, authenticated;

-- Step 1: existing objects. `ALL TABLES IN SCHEMA` covers every current table including
-- manual_migration_ledger; sequences and functions are swept for the same reason.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint

-- Step 2: future objects created by `postgres` — the role this repository's migrations run as.
-- REVOKE ALL supersedes 0008's narrower revocation; the two are not in conflict.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;--> statement-breakpoint

-- Step 3: future objects created by `supabase_admin` — the dangerous default (full DML).
-- PostgreSQL only permits this if the executing role is a member of supabase_admin. Attempting
-- it unconditionally would abort the whole migration on a project where it is not, so the
-- membership is tested first and the outcome is announced. If this raises the NOTICE, the
-- residual risk is narrow but real and must be reviewed before Stage 1: it applies solely to
-- tables in schema public created BY supabase_admin, which nothing in this repository does —
-- every migration here runs as `postgres`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
    RAISE NOTICE '0012: supabase_admin defaults revoked';
  ELSE
    RAISE NOTICE '0012: SKIPPED supabase_admin defaults — % is not a member of supabase_admin. Tables created in schema public BY supabase_admin still inherit full DML for anon/authenticated. Re-run this step from a role that is a member before Stage 1.', current_user;
  END IF;
END $$;
