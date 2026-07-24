-- 0011 — woop_entries joins the soft-delete regime, and existing orphaned children are closed
--         (audit probe A13 / GA-025 residual, invariants SOFT-DELETE-001 · SOFT-DELETE-002)
--
-- WHY. `softDeleteGoal` now cascades a soft delete to contributions, checklist items, comments,
-- media and check-ins in one transaction. Two child tables were left out because they have no
-- `deleted_at` column at all:
--   * woop_entries  — user content. Being unable to close it is a schema gap, fixed here.
--   * goal_revisions — append-only history of the goal itself. Deliberately NOT given a
--                      deleted_at: history must survive its subject, and it is reachable only
--                      through the goal. SPEC-16 keeps it INSERT-only for the same reason.
--
-- Probe A13 on 2026-07-20 found live children under soft-deleted goals; re-measured 2026-07-25,
-- before this migration: checklist_items 2, comments 1, contributions 1, woop_entries 1,
-- checkins 0, media_items 0. Those rows predate the cascade fix — the fix prevents new ones and
-- cannot retroactively close old ones. Step 3 closes them, stamping each child with its parent's
-- own deleted_at so the record stays truthful about when it left the user's view.
--
-- PRECONDITION (populated database): none beyond a fresh backup — step 3 writes rows.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "woop_entries_goal_id_live_unique";
--   CREATE UNIQUE INDEX "woop_entries_goal_id_unique" ON "woop_entries" ("goal_id");
--   ALTER TABLE "woop_entries" DROP COLUMN IF EXISTS "deleted_at";
--   -- step 3 is data, not schema: restore the affected rows from the backup taken beforehand.

-- Step 1: the column.
ALTER TABLE "woop_entries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;--> statement-breakpoint

-- Step 2: uniqueness must now be PARTIAL, replacing the total index created by 0009.
-- With a total index a soft-deleted WOOP would permanently reserve its goal_id and the user
-- could never write a new one for that goal — soft delete would behave like a poison pill.
-- 0009 stays as applied history; this migration supersedes its index rather than editing it.
DROP INDEX IF EXISTS "woop_entries_goal_id_unique";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "woop_entries_goal_id_live_unique"
  ON "woop_entries" ("goal_id")
  WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Step 3: close the pre-existing orphans, using the parent's timestamp, never now().
UPDATE "woop_entries" c SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = c."goal_id"
    AND g."deleted_at" IS NOT NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "checklist_items" c SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = c."goal_id"
    AND g."deleted_at" IS NOT NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "comments" c SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = c."goal_id"
    AND g."deleted_at" IS NOT NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "contributions" c SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = c."goal_id"
    AND g."deleted_at" IS NOT NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "checkins" c SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = c."goal_id"
    AND g."deleted_at" IS NOT NULL AND c."deleted_at" IS NULL;--> statement-breakpoint

-- media_items hang off either a goal or a comment; close both routes.
UPDATE "media_items" m SET "deleted_at" = g."deleted_at"
  FROM "goals" g WHERE g."id" = m."goal_id"
    AND g."deleted_at" IS NOT NULL AND m."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "media_items" m SET "deleted_at" = g."deleted_at"
  FROM "comments" c JOIN "goals" g ON g."id" = c."goal_id"
  WHERE c."id" = m."comment_id"
    AND g."deleted_at" IS NOT NULL AND m."deleted_at" IS NULL;
