-- Custom SQL migration file, put your code below! --

-- woop_entries: one row per goal (GA-017 / CR-018).
--
-- saveWoop is a Server Action, i.e. a public POST endpoint. It used to ask
-- "does this goal already have a WOOP?" and then insert or update in a separate
-- round trip. Two tabs (or a double submit) both answered "no" and both
-- inserted; nothing rejected the second row because goal_id carries no UNIQUE
-- constraint. Reads then pick the newest row by created_at, so the loser's
-- wish/outcome/obstacle/plan silently became unreachable — the user sees one
-- WOOP and does not know a second exists.
--
-- lib/db/queries/woop.ts `saveWoopEntry` now decides and writes under a
-- FOR UPDATE lock on the parent goal row, which closes the race in the
-- application. This index is the database-level backstop for the same
-- invariant: it also covers any writer that does not go through that function.
--
-- PRECONDITION (populated database): woop_entries must contain no goal_id with
-- more than one row, or the CREATE UNIQUE INDEX aborts. Step 1 enforces that.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "woop_entries_goal_id_unique";
-- Step 1 is NOT reversible — it deletes rows. Take a backup first
-- (`npm run db:backup`). See the note on that step before running it.

-- Step 1: collapse any pre-existing duplicates, keeping the newest row per
-- goal — the same row every read already resolves to today, so this preserves
-- exactly what the user currently sees and discards only shadow rows.
--
-- This is a HARD DELETE, unlike everything else in this schema, because
-- woop_entries has no deleted_at column to soft-delete into. That is why the
-- backup precondition above is not optional.
--
-- As of the 2026-07-20 probe run (migration_state_probe.sql, section A15) this
-- database had ZERO duplicate goal_id values, so this statement is expected to
-- delete nothing. Verify that before running:
--   SELECT goal_id, count(*) FROM woop_entries GROUP BY goal_id HAVING count(*) > 1;
DELETE FROM "woop_entries" w
WHERE EXISTS (
  SELECT 1
  FROM "woop_entries" keeper
  WHERE keeper."goal_id" = w."goal_id"
    AND (keeper."created_at", keeper."id") > (w."created_at", w."id")
);--> statement-breakpoint

-- Step 2: the constraint itself. Not partial — woop_entries has no deleted_at,
-- so every row in the table is live by definition.
CREATE UNIQUE INDEX IF NOT EXISTS "woop_entries_goal_id_unique"
  ON "woop_entries" ("goal_id");
