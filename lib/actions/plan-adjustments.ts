"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  getChecklistItemTx,
  insertChecklistItemTx,
  updateChecklistItemTx,
} from "@/lib/db/queries/checklist";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { insertPlanAdjustmentTx } from "@/lib/db/queries/plan-adjustments";
import { resolveCheckinDate } from "@/lib/validators/checkin";
import { planAdjustmentInputSchema } from "@/lib/validators/plan-adjustment";
import { resolveReflectionWeek } from "@/lib/validators/reflection";
import { track } from "@/lib/analytics/events";

export type SavePlanAdjustmentResult =
  | { ok: true; duplicate: boolean; changedStep: boolean }
  | { ok: false; reason: "not_found" | "stale_token" | "item_not_found" | "no_if_then" | "invalid" };

const MAX_COPING_TITLE_LENGTH = 200;

/** Decisions D7's exact truncation: "Если {trigger} — то {action}", cut to
 *  199 chars plus "…" when it would otherwise overflow the 200-char title. */
function copingPlanTitle(trigger: string, action: string): string {
  const title = `Если ${trigger} — то ${action}`;
  if (title.length <= MAX_COPING_TITLE_LENGTH) return title;
  return `${title.slice(0, MAX_COPING_TITLE_LENGTH - 1)}…`;
}

/** Thrown from inside the goal lock to abort the transaction on a rejection
 *  that happens AFTER the plan-adjustment row was inserted (Decisions §4.4:
 *  the record of the decision must not outlive a failed step edit). Caught
 *  once, outside withLockedLiveGoal. */
class PlanAdjustmentRejection extends Error {
  constructor(public readonly reason: "not_found" | "item_not_found" | "no_if_then") {
    super(reason);
  }
}

type LockedWork = { kind: "duplicate" } | { kind: "applied"; changedStep: boolean };

/**
 * Records what blocked a step and what the person chose to do about it, and —
 * for every decision but "keep"/"pause_goal"/"drop_goal" — makes that choice
 * change tomorrow's step for real (T12, PLAN §5 B4). Runs as its own action,
 * never as part of saveCheckin/saveReflection (Decisions D1): an honest
 * "partial"/"skipped" must already be saved by the time this is called.
 *
 * The record and the step edit share one transaction under the goal's lock
 * (GA-015): a duplicate submit (Decisions D4) inserts nothing and changes
 * nothing, and a step edit that fails rolls the record back with it.
 */
export async function savePlanAdjustment(input: unknown): Promise<SavePlanAdjustmentResult> {
  const user = await getCurrentUser();

  const parsed = planAdjustmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const data = parsed.data;

  // The date is always server-derived, never taken from the client — same
  // day/week-token contract as saveCheckin/saveReflection (GA-013/CR-030).
  let sourceDate: string;
  if (data.source === "checkin") {
    const resolved = resolveCheckinDate(data.expectedToken);
    if (!resolved.ok) return { ok: false, reason: "stale_token" };
    sourceDate = resolved.date;
  } else {
    const resolved = resolveReflectionWeek(data.expectedToken);
    if (!resolved.ok) return { ok: false, reason: "stale_token" };
    sourceDate = resolved.weekStart;
  }

  let work: LockedWork;
  try {
    const locked = await withLockedLiveGoal(user.id, data.goalId, async (tx, goal): Promise<LockedWork> => {
      if (goal.status !== "active") {
        throw new PlanAdjustmentRejection("not_found");
      }

      const inserted = await insertPlanAdjustmentTx(tx, {
        goalId: data.goalId,
        checklistItemId: data.checklistItemId ?? null,
        source: data.source,
        sourceDate,
        decision: data.decision,
        barrier: data.barrier,
      });
      // Decisions D4: a conflicting resubmit changes nothing about the step —
      // otherwise replaying the form would shrink the step twice.
      if (!inserted) return { kind: "duplicate" };

      let changedStep = false;
      switch (data.decision) {
        case "keep":
        case "pause_goal":
        case "drop_goal":
          // Decisions D6: never touches the goal's status — that stays with
          // GoalDangerActions (T13 wires the button, this only records intent).
          break;

        case "smaller": {
          // superRefine guarantees these on this decision.
          const checklistItemId = data.checklistItemId!;
          const stepTitle = data.stepTitle!;
          const updated = await updateChecklistItemTx(tx, data.goalId, checklistItemId, {
            title: stepTitle,
          });
          if (!updated) throw new PlanAdjustmentRejection("item_not_found");
          changedStep = true;
          break;
        }

        case "change_trigger": {
          const checklistItemId = data.checklistItemId!;
          const trigger = data.trigger!;
          const item = await getChecklistItemTx(tx, data.goalId, checklistItemId);
          if (!item) throw new PlanAdjustmentRejection("item_not_found");
          if (item.ifThen == null) throw new PlanAdjustmentRejection("no_if_then");
          const updated = await updateChecklistItemTx(tx, data.goalId, checklistItemId, {
            ifThen: { ...item.ifThen, trigger },
          });
          if (!updated) throw new PlanAdjustmentRejection("item_not_found");
          changedStep = true;
          break;
        }

        case "add_coping_plan": {
          const copingTrigger = data.copingTrigger!;
          const copingAction = data.copingAction!;
          await insertChecklistItemTx(tx, {
            goalId: data.goalId,
            title: copingPlanTitle(copingTrigger, copingAction),
            kind: "if_then",
            ifThen: { trigger: copingTrigger, action: copingAction, planType: "relapse_prevention" },
          });
          changedStep = true;
          break;
        }
      }

      return { kind: "applied", changedStep };
    });

    if (locked === null) return { ok: false, reason: "not_found" };
    work = locked;
  } catch (error) {
    if (error instanceof PlanAdjustmentRejection) return { ok: false, reason: error.reason };
    throw error;
  }

  if (work.kind === "duplicate") return { ok: true, duplicate: true, changedStep: false };

  // Only reported for a genuinely new record — a duplicate is a no-op that
  // must not inflate the count (mirrors saveCheckin/saveReflection's T7
  // after-the-write, outside-any-transaction reporting).
  track({
    name: "plan_adjustment_saved",
    source: data.source,
    barrier: data.barrier,
    decision: data.decision,
    changed_step: work.changedStep,
  });

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/reflections");
  revalidatePath(`/goals/${data.goalId}`);

  return { ok: true, duplicate: false, changedStep: work.changedStep };
}
