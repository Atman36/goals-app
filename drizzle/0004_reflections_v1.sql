-- Custom SQL migration file, put your code below! --

-- reflections v1: additive columns for the weekly-reflection promise cycle
-- (growth-reactor v5 §6/§11/§12). "checkin_outcome" is reused as the shared
-- outcome vocabulary for a promise's fate (done/partial/skipped) — same
-- idempotent DO-guard as 0003_checkins.sql, harmless since the enum already
-- exists.
DO $$
BEGIN
  CREATE TYPE "public"."checkin_outcome" AS ENUM('done', 'partial', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "reflections" ADD COLUMN IF NOT EXISTS "learned" text;--> statement-breakpoint
ALTER TABLE "reflections" ADD COLUMN IF NOT EXISTS "promise" text;--> statement-breakpoint
ALTER TABLE "reflections" ADD COLUMN IF NOT EXISTS "prev_outcome" "checkin_outcome";--> statement-breakpoint

-- One reflection per (user, week) — re-saving the same week updates it (see
-- the upsert in lib/db/queries/reflections.ts).
CREATE UNIQUE INDEX IF NOT EXISTS "reflections_user_week_unique" ON "reflections" ("user_id","week_start");
