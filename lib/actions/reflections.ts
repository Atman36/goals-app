"use server";

import { addDays, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import type { Reflection } from "@/lib/db/schema";
import {
  insertChecklistItemTx,
  softDeleteChecklistItemTx,
  updateChecklistItemTx,
} from "@/lib/db/queries/checklist";
import { listGoals } from "@/lib/db/queries/goals";
import { withLockedLiveGoal, type Transaction } from "@/lib/db/queries/parent-lock";
import {
  getLatestReflectionBefore,
  getReflectionByWeek,
  upsertReflection,
} from "@/lib/db/queries/reflections";
import { toDateKey } from "@/lib/utils/date-keys";
import { reflectionInputSchema, resolveReflectionWeek } from "@/lib/validators/reflection";
import { track } from "@/lib/analytics/events";

export type ReflectionState = {
  /** "stale" = the week rolled over while the form was open (CR-030). The
   *  answers were NOT saved; the user must reload to get the new week's form. */
  status: "idle" | "success" | "error" | "stale";
  message?: string;
  /** T9 (PLAN §6 C2): this save is the one that closed a weekly cycle — the
   *  previous promise went from "no outcome" to having one. Set only on that
   *  transition, so re-saving the same week celebrates nothing. */
  cycleClosed?: boolean;
};

const GENERIC_ERROR = "Не удалось сохранить рефлексию, попробуйте ещё раз";
const MISSING_OUTCOME_ERROR = "Отметьте исход прошлого обещания";
const STALE_WEEK_ERROR =
  "Неделя сменилась, пока форма была открыта — ответы не сохранены. Обновите страницу, чтобы заполнить рефлексию новой недели.";
const GOAL_REQUIRED_ERROR = "Выберите цель, к которой относится обещание";
const GOAL_NOT_FOUND_ERROR = "Цель не найдена или удалена";

/** Decisions #2's exact format for the derived `newIfThen` text — also reused
 *  as the created checklist item's title (truncated to fit), since the T5
 *  form collects no separate title for this step. */
function formatIfThenSummary(trigger: string, action: string): string {
  return `Если ${trigger} — то ${action}`;
}

/** Creates, updates, or soft-deletes this week's if-then step and returns
 *  what `reflections.ifThenItemId`/`newIfThen` should become — called INSIDE
 *  the caller's withLockedLiveGoal transaction (T5 Decisions #1/#3/#4/#5).
 *  `currentItemId` is the reflection row's existing ifThenItemId, read before
 *  the lock was taken (best-effort, same as this file's other pre-lock reads
 *  — see the T5 report for why a stricter re-check isn't wired up here). */
async function applyIfThenStep(
  tx: Transaction,
  goalId: string,
  currentItemId: string | null,
  weekStart: string,
  trigger: string | undefined,
  action: string | undefined,
  planType: "initiation" | "maintenance" | "relapse_prevention" | undefined,
): Promise<{
  ifThenItemId: string | null;
  newIfThen: string | undefined;
  /** T7: which of create/update/remove actually happened, so the caller can
   *  report it AFTER the transaction commits. `null` = nothing to report. */
  operation: "created" | "updated" | "removed" | null;
}> {
  if (trigger && action) {
    const ifThen = { trigger, action, planType: planType ?? "initiation" };
    const summary = formatIfThenSummary(trigger, action);
    const title = summary.slice(0, 200);
    // Decisions #5: due on the Sunday of the reflection's own week, so the
    // step surfaces on "Сегодня" within the week the promise was made for.
    const dueDate = toDateKey(addDays(parseISO(weekStart), 6));

    let ifThenItemId = currentItemId;
    let operation: "created" | "updated" = "updated";
    if (ifThenItemId) {
      await updateChecklistItemTx(tx, goalId, ifThenItemId, { title, ifThen, dueDate });
    } else {
      const created = await insertChecklistItemTx(tx, {
        goalId,
        title,
        kind: "if_then",
        ifThen,
        dueDate,
      });
      ifThenItemId = created.id;
      operation = "created";
    }
    return { ifThenItemId, newIfThen: summary, operation };
  }

  if (currentItemId) {
    await softDeleteChecklistItemTx(tx, goalId, currentItemId);
    return { ifThenItemId: null, newIfThen: undefined, operation: "removed" };
  }
  return { ifThenItemId: null, newIfThen: undefined, operation: null };
}

/** Saves (upserts) this week's reflection — the 5 questions plus, when a
 *  previous promise exists, its outcome (growth-reactor v5 §6/§11/§12: a
 *  completed promise cycle is the product's North Star).
 *
 *  weekStart is always server-derived, never taken from the client. The form
 *  posts the week it was rendered for (`expectedWeekStart`) purely so this
 *  action can detect a week boundary crossed between render and submit and
 *  refuse the write instead of filing the answers under the wrong week — see
 *  the week-token contract in lib/validators/reflection.ts (CR-030). */
export async function saveReflection(
  _prevState: ReflectionState,
  formData: FormData,
): Promise<ReflectionState> {
  const user = await getCurrentUser();

  const parsed = reflectionInputSchema.safeParse({
    promised: formData.get("promised"),
    done: formData.get("done"),
    blocked: formData.get("blocked"),
    learned: formData.get("learned"),
    promise: formData.get("promise"),
    prevOutcome: formData.get("prevOutcome") || undefined,
    newIfThen: formData.get("newIfThen") || undefined,
    promiseGoalId: formData.get("promiseGoalId") || undefined,
    ifThenTrigger: formData.get("ifThenTrigger") || undefined,
    ifThenAction: formData.get("ifThenAction") || undefined,
    ifThenPlanType: formData.get("ifThenPlanType") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: GENERIC_ERROR };
  }

  // CR-030: reject rather than silently rewrite the target week.
  const week = resolveReflectionWeek(formData.get("expectedWeekStart"));
  if (!week.ok) {
    return { status: "stale", message: STALE_WEEK_ERROR };
  }
  const weekStart = week.weekStart;

  const prev = await getLatestReflectionBefore(user.id, weekStart);
  if (prev?.promise?.trim() && !parsed.data.prevOutcome) {
    return { status: "error", message: MISSING_OUTCOME_ERROR };
  }

  // The if-then fields are handled separately from the rest of the row (T5) —
  // pulled out here so neither branch below ever writes them to `reflections`
  // directly; the goal branch replaces `newIfThen` with the server-derived
  // string and adds `ifThenItemId` itself (Decisions #2/#3).
  const { ifThenTrigger, ifThenAction, ifThenPlanType, ...reflectionFields } = parsed.data;
  const { promiseGoalId } = reflectionFields;

  // Decisions D1/D3: a goal is required whenever the user has one to point
  // at; the ownership check happens under the SAME lock as the write (GA-015
  // idiom — see lib/db/queries/parent-lock.ts), not in an earlier round trip
  // a concurrent soft-delete could race. A promise with no goal (D2/D4) never
  // opens a transaction at all — there is no parent row to hold.
  // T5 Decisions #1 / T7: this week's row as it stands BEFORE the write —
  // `ifThenItemId` drives the idempotent step update, `prevOutcome` tells the
  // cycle event whether the outcome is being registered for the first time.
  // Read outside the lock like this file's other pre-lock reads: a concurrent
  // duplicate save could at worst report the cycle twice, which is a log line,
  // not a data fault.
  const existing = await getReflectionByWeek(user.id, weekStart);
  const outcomeAlreadyRecorded = existing?.prevOutcome != null;

  let saved: Reflection | null;
  let ifThenOperation: "created" | "updated" | "removed" | null = null;
  if (promiseGoalId) {
    const currentItemId = existing?.ifThenItemId ?? null;

    const result = await withLockedLiveGoal(user.id, promiseGoalId, async (tx) => {
      const { ifThenItemId, newIfThen, operation } = await applyIfThenStep(
        tx,
        promiseGoalId,
        currentItemId,
        weekStart,
        ifThenTrigger,
        ifThenAction,
        ifThenPlanType,
      );
      const row = await upsertReflection(
        user.id,
        weekStart,
        { ...reflectionFields, ifThenItemId, newIfThen },
        tx,
      );
      return { row, operation };
    });
    if (!result?.row) return { status: "error", message: GOAL_NOT_FOUND_ERROR };
    saved = result.row;
    ifThenOperation = result.operation;
  } else {
    const activeGoals = await listGoals(user.id, { status: "active" });
    if (activeGoals.length > 0) {
      return { status: "error", message: GOAL_REQUIRED_ERROR };
    }
    saved = await upsertReflection(user.id, weekStart, reflectionFields);
    if (!saved) return { status: "error", message: GENERIC_ERROR };
  }

  // T7: reported after the write, outside the transaction. Counts and bits
  // only — not one of the five answers, the promise, or the if-then text.
  const hasIfThen = !!(ifThenTrigger && ifThenAction);
  track({
    name: "reflection_saved",
    goal_id: promiseGoalId,
    answers_filled: [
      reflectionFields.promised,
      reflectionFields.done,
      reflectionFields.blocked,
      reflectionFields.learned,
      reflectionFields.promise,
    ].filter((answer) => !!answer).length,
    has_promise: !!reflectionFields.promise,
    promise_has_goal: !!promiseGoalId,
    has_if_then: hasIfThen,
  });

  // North Star, and only on the transition: re-saving the same week must not
  // count the cycle again. The SAME flag drives the event and the celebration
  // the form shows (T9) — computing it twice is how the two drift apart.
  const cycleClosed = !!parsed.data.prevOutcome && !outcomeAlreadyRecorded;
  if (cycleClosed && parsed.data.prevOutcome) {
    track({
      name: "weekly_cycle_completed",
      goal_id: promiseGoalId,
      outcome: parsed.data.prevOutcome,
      had_if_then: hasIfThen,
    });
  }

  if (ifThenOperation) {
    track({
      name: "if_then_structured",
      goal_id: promiseGoalId,
      plan_type: ifThenOperation === "removed" ? undefined : (ifThenPlanType ?? "initiation"),
      operation: ifThenOperation,
    });
  }

  revalidatePath("/reflections");
  revalidatePath("/review");
  // The home page shows this week's promise and the rhythm bars, and a saved
  // reflection is itself an active week.
  revalidatePath("/");

  // Celebrated whatever the outcome, including «Не в этот раз»: what is being
  // marked is that the cycle closed honestly, not that the week went well.
  return { status: "success", message: "Сохранено ✓", cycleClosed };
}
