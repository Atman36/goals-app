-- 0014 — plan_adjustments: the "узел сличения" this task builds a home for (T12, PLAN §5 B4,
--         growth-reactor v5). After an honest "не сделал" (checkin) or a closed weekly cycle
--         (reflection), records what blocked the step and what the person chose to do about it.
--
-- WHY. Today an honest "partial"/"skipped" check-in ends at the record — tomorrow's step stays
-- the same one the person already stumbled on. This table is where the chosen response is stored
-- so it can change that step for real (see lib/actions/plan-adjustments.ts).
--
-- Goal-child table (no user_id; ownership via goals.user_id, same convention as checkins/
-- contributions/checklist_items). `decision`/`barrier`/`source` are plain `text` + CHECK, not a
-- pgEnum (Decisions D2) — no CREATE TYPE here; the TypeScript union lives in
-- lib/validators/plan-adjustment.ts, the one place both the schema and this file's CHECK lists
-- are meant to be kept in sync with by hand.
--
-- PRECONDITION (populated database): none — creates one new table, touches no existing data.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.plan_adjustments;

CREATE TABLE IF NOT EXISTS "plan_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL REFERENCES "public"."goals"("id") ON DELETE cascade,
	"checklist_item_id" uuid REFERENCES "public"."checklist_items"("id") ON DELETE set null,
	"source" text NOT NULL CONSTRAINT "plan_adjustments_source_check"
		CHECK ("source" IN ('checkin', 'reflection')),
	"source_date" date NOT NULL,
	"decision" text NOT NULL CONSTRAINT "plan_adjustments_decision_check"
		CHECK ("decision" IN ('keep', 'smaller', 'change_trigger', 'add_coping_plan', 'pause_goal', 'drop_goal')),
	"barrier" text NOT NULL CONSTRAINT "plan_adjustments_barrier_check"
		CHECK ("barrier" IN ('time', 'energy', 'emotion', 'unclear_step', 'wrong_context', 'forgot', 'competing_goal', 'external_event', 'not_my_goal_anymore')),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

-- Idempotency (Decisions D4): one live record per (goal, source, day/week) — a resubmit conflicts
-- here instead of applying its checklist edit a second time (see insertPlanAdjustmentTx).
CREATE UNIQUE INDEX IF NOT EXISTS "plan_adjustments_goal_source_date_uniq"
	ON "plan_adjustments" ("goal_id", "source", "source_date")
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Backs getRecentPlanAdjustmentForGoal / listPlanAdjustmentsForUser's "most recent first" reads.
CREATE INDEX IF NOT EXISTS "plan_adjustments_goal_created_idx"
	ON "plan_adjustments" ("goal_id", "created_at" DESC)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Deny-first, per security/RLS_ACTIVATION_ORDER.md (see 0010/0012's default-ACL trap). No CREATE
-- POLICY (Decisions D3): the app has no user-level authentication yet — getCurrentUser() always
-- resolves the single owner, access runs as `postgres`, and a policy keyed on auth.uid() would be
-- dead code that only adds to the FOR ALL policies already queued for a rework once users.id is
-- linked to auth.uid(). RLS on with zero policies denies anon/authenticated outright, which is
-- strictly safer than a policy that can never fire.
REVOKE ALL ON TABLE "plan_adjustments" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "plan_adjustments" ENABLE ROW LEVEL SECURITY;
