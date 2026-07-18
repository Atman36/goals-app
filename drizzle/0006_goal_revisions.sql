-- Custom SQL migration file, put your code below! --

-- goal_revisions: prior snapshot of a goal's formulation (title/description/
-- deadline) captured on every content edit — «Траектория» Stage0-5. Goal-child
-- table (no user_id; ownership goes through goals.user_id, same convention as
-- contributions/checkins). `changed` is the jsonb array of field names that
-- differed on that edit. Written inside the updateGoal transaction only when a
-- field actually changes (see lib/db/queries/goal-revisions.ts); status changes
-- and soft deletes never create a row. Additive only.
CREATE TABLE IF NOT EXISTS "goal_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL REFERENCES "public"."goals"("id") ON DELETE cascade,
	"title" varchar(60) NOT NULL,
	"description" text,
	"deadline" date NOT NULL,
	"changed" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "goal_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Child table: ownership is proven by an EXISTS-join to goals on goal_id —
-- mirrors checkins_owner (0003_checkins.sql:34-37).
DROP POLICY IF EXISTS "goal_revisions_owner" ON "goal_revisions";--> statement-breakpoint
CREATE POLICY "goal_revisions_owner" ON "goal_revisions" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_revisions.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_revisions.goal_id AND g.user_id = auth.uid()));
