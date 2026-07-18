-- Custom SQL migration file, put your code below! --

-- checkins: daily emotion check-in for the focus goal (growth-reactor v5
-- §5/§6/§12). Goal-child table — no user_id column; ownership goes through
-- goals.user_id, same convention as contributions/checklist_items/comments/
-- media_items. One row per (goal_id, date); re-saving the same day updates
-- it (see lib/db/queries/checkins.ts's upsert). "Не сегодня" (skipped) is a
-- valid, honestly-marked outcome and still counts as streak activity.
DO $$
BEGIN
  CREATE TYPE "public"."checkin_outcome" AS ENUM('done', 'partial', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL REFERENCES "public"."goals"("id") ON DELETE cascade,
	"date" date NOT NULL,
	"outcome" "checkin_outcome" NOT NULL,
	"feeling" smallint NOT NULL CONSTRAINT "checkins_feeling_range_check" CHECK ("feeling" BETWEEN 1 AND 5),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "checkins_goal_date_unique" ON "checkins" ("goal_id","date");--> statement-breakpoint

ALTER TABLE "checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Child table: ownership is proven by an EXISTS-join to goals on goal_id —
-- mirrors contributions_owner (0001_rls_and_constraints.sql:31-33).
DROP POLICY IF EXISTS "checkins_owner" ON "checkins";--> statement-breakpoint
CREATE POLICY "checkins_owner" ON "checkins" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = checkins.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = checkins.goal_id AND g.user_id = auth.uid()));
