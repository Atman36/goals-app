-- Custom SQL migration file, put your code below! --

-- goal_sphere: optional life sphere (сфера жизни) a goal belongs to, feeds
-- the weekly-review balance wheel (growth-reactor v5 Stage0-4). Nullable —
-- existing goals stay NULL ("Без сферы"), no default value. Same idempotent
-- DO-guard idiom as 0003_checkins.sql/0004_reflections_v1.sql.
DO $$ BEGIN
  CREATE TYPE "public"."goal_sphere" AS ENUM ('health','career','finance','growth','relationships','environment','leisure','meaning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "sphere" "goal_sphere";
