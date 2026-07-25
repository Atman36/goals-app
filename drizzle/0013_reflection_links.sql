-- 0013 — reflections gets two optional links: promise → goal, if-then → checklist item
--
-- WHY. `promise` is free text with no addressee today: it can't say which goal it moves,
-- never renders on a screen, and can't be measured. Methodology review (2026-07-25) names
-- binding the promise to a concrete goal a load-bearing condition of the mechanism (the
-- promised-vs-measured correspondence), not a schema nicety. These two columns are the
-- foundation for tasks B1/B2/B3.
--
-- Both columns are nullable, no DEFAULT — historical rows stay valid. No ON DELETE action:
-- goals and checklist_items are only soft-deleted (deleted_at), never hard-deleted, so a
-- cascade here would only do harm; a promise whose goal is gone/soft-deleted is handled on
-- read (task B1). The index is partial (promise_goal_id IS NOT NULL) because only "this
-- goal's promise" reads are planned — if_then_item_id has no by-value read planned, so it
-- gets none.

ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS promise_goal_id uuid REFERENCES goals(id),
  ADD COLUMN IF NOT EXISTS if_then_item_id uuid REFERENCES checklist_items(id);

CREATE INDEX IF NOT EXISTS reflections_promise_goal_idx
  ON reflections (promise_goal_id) WHERE promise_goal_id IS NOT NULL;
