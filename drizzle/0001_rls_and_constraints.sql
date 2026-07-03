-- Custom SQL migration file, put your code below! --

-- Row Level Security is defense-in-depth for Supabase's auto-generated REST/Realtime
-- API (auth.uid() comes from Supabase's API roles). The Next.js app connects via
-- postgres-js as the DB owner and bypasses RLS, so every app query must still scope
-- by userId explicitly — see lib/db/queries/*.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "woop_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reflections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Owner-scoped policies: users/goals/reflections own a user_id column directly.
CREATE POLICY "users_owner" ON "users" FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());--> statement-breakpoint

CREATE POLICY "goals_owner" ON "goals" FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());--> statement-breakpoint

CREATE POLICY "reflections_owner" ON "reflections" FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());--> statement-breakpoint

-- Child tables: ownership is proven by an EXISTS-join to goals on goal_id.
CREATE POLICY "contributions_owner" ON "contributions" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = contributions.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = contributions.goal_id AND g.user_id = auth.uid()));--> statement-breakpoint

CREATE POLICY "checklist_items_owner" ON "checklist_items" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = checklist_items.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = checklist_items.goal_id AND g.user_id = auth.uid()));--> statement-breakpoint

CREATE POLICY "comments_owner" ON "comments" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = comments.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = comments.goal_id AND g.user_id = auth.uid()));--> statement-breakpoint

CREATE POLICY "woop_entries_owner" ON "woop_entries" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = woop_entries.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = woop_entries.goal_id AND g.user_id = auth.uid()));--> statement-breakpoint

-- media_items: owned either directly via goal_id, or indirectly via comment_id -> comments -> goals.
CREATE POLICY "media_items_owner" ON "media_items" FOR ALL TO authenticated
  USING (
    (goal_id IS NOT NULL AND EXISTS (SELECT 1 FROM goals g WHERE g.id = media_items.goal_id AND g.user_id = auth.uid()))
    OR
    (comment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM comments c JOIN goals g ON g.id = c.goal_id
      WHERE c.id = media_items.comment_id AND g.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (goal_id IS NOT NULL AND EXISTS (SELECT 1 FROM goals g WHERE g.id = media_items.goal_id AND g.user_id = auth.uid()))
    OR
    (comment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM comments c JOIN goals g ON g.id = c.goal_id
      WHERE c.id = media_items.comment_id AND g.user_id = auth.uid()
    ))
  );--> statement-breakpoint

-- fx_rates: shared reference data, readable by any authenticated user; writes are service-role only
-- (no INSERT/UPDATE policy is added for `authenticated`).
CREATE POLICY "fx_rates_select" ON "fx_rates" FOR SELECT TO authenticated
  USING (true);--> statement-breakpoint

-- CHECK constraints encoding the money invariants (PRD §4), mirrored from lib/validators/goal.ts
-- and lib/validators/contribution.ts — the DB is the backstop, not the primary enforcement.
ALTER TABLE "goals" ADD CONSTRAINT "goals_kind_amount_check" CHECK (
  (kind = 'financial' AND currency IS NOT NULL AND target_amount IS NOT NULL AND target_amount > 0)
  OR
  (kind = 'non_financial' AND currency IS NULL AND target_amount IS NULL)
);--> statement-breakpoint

ALTER TABLE "contributions" ADD CONSTRAINT "contributions_amount_nonzero_check" CHECK (amount <> 0);--> statement-breakpoint

-- Currency lock: a goal's currency may not change once it has a non-deleted contribution.
-- Defense-in-depth behind the Server Action check that comes in a later task.
CREATE OR REPLACE FUNCTION goals_currency_lock() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.currency IS DISTINCT FROM NEW.currency AND EXISTS (
    SELECT 1 FROM contributions c WHERE c.goal_id = NEW.id AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'currency_locked: goal has contributions';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "goals_currency_lock_trigger"
  BEFORE UPDATE ON "goals"
  FOR EACH ROW
  EXECUTE FUNCTION goals_currency_lock();
