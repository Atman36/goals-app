-- Custom SQL migration file, put your code below! --

-- media_items.storage_path uniqueness (CR-009). registerMedia is a public POST
-- endpoint (Server Action): the same already-uploaded storage object could be
-- registered any number of times — a double-submit, a retry after a timeout,
-- or a replayed request — and each call inserted another media_items row, so
-- one uploaded file showed up as N identical gallery thumbnails.
--
-- The index is PARTIAL (deleted_at IS NULL) on purpose:
--   * soft delete is the only delete in this schema, so a full index would
--     keep a removed image's path reserved forever and block re-uploading it;
--   * uniqueness among *live* rows is exactly the invariant the gallery needs.
-- lib/db/queries/media.ts inserts with a target-less ON CONFLICT DO NOTHING,
-- which arbitrates over partial indexes too, and then returns the pre-existing
-- live row so a replayed registration is idempotent instead of an error.

-- Step 1: pre-existing duplicates would abort the CREATE INDEX below. Keep the
-- earliest row per path and soft-delete the rest — never a hard DELETE.
-- NB: a goals.cover_image_id pointing at one of the soft-deleted copies keeps
-- a dangling reference; re-pick the cover for such a goal if any row is hit.
UPDATE "media_items" m
SET "deleted_at" = now()
WHERE m."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "media_items" keeper
    WHERE keeper."storage_path" = m."storage_path"
      AND keeper."deleted_at" IS NULL
      AND (keeper."created_at", keeper."id") < (m."created_at", m."id")
  );--> statement-breakpoint

-- Step 2: the constraint itself.
CREATE UNIQUE INDEX IF NOT EXISTS "media_items_storage_path_live_key"
  ON "media_items" ("storage_path")
  WHERE "deleted_at" IS NULL;
