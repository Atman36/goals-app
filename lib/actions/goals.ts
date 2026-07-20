"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  insertGoalWithWoop,
  softDeleteGoal,
  setGoalStatus,
  getGoalWithDetails,
  type GoalWithProgress,
  type SetGoalStatusResult,
} from "@/lib/db/queries/goals";
import { setUserFocusGoal } from "@/lib/db/queries/users";
import { updateGoalWithRevision } from "@/lib/db/queries/goal-revisions";
import type { NewGoal, User } from "@/lib/db/schema";
import { goalSchema, goalUpdateSchema, goalIdSchema, type GoalInput } from "@/lib/validators/goal";
import { woopInputSchema, type WoopInput } from "@/lib/validators/woop";
import { parseMajorAmountToMinor, calcFinancialProgress } from "@/lib/utils/money";
import type { SelfConcordanceAnswers } from "@/lib/utils/concordance";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import type { ClientGoalInput } from "@/components/goals/goal-form-schema";

export type GoalActionResult =
  | { ok: true; goalId: string }
  /** `stale` marks the one failure the edit UI handles differently: nothing was
   *  written because the goal changed after this form was rendered (GA-012). */
  | { ok: false; error: string; stale?: boolean };

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_VALIDATION_ERROR = "Проверьте поля формы";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";
const ILLEGAL_TRANSITION_ERROR = "Это действие недоступно для цели в текущем статусе";
const STALE_GOAL_ERROR =
  "Цель изменилась, пока форма была открыта — правки не сохранены. Обновите страницу, чтобы не потерять чужие изменения.";

/** Maps a failed status transition onto the action's error string. */
function statusErrorFor(result: Extract<SetGoalStatusResult, { ok: false }>): string {
  return result.reason === "not_found" ? GENERIC_NOT_FOUND_ERROR : ILLEGAL_TRANSITION_ERROR;
}

/** The focus goal must always be an active, non-deleted goal (setFocusGoal and
 *  getFocusGoal both assert that) — so archiving, achieving or deleting the
 *  focused goal has to release the pointer instead of leaving a stale one that
 *  only some views filter out. */
async function clearFocusIfPointingAt(user: User, goalId: string): Promise<void> {
  if (user.focusGoalId !== goalId) return;
  await setUserFocusGoal(user.id, null);
}

/** Parses a major-unit amount string straight into bigint minor units, or null
 *  if it isn't a whole non-negative amount that fits the int8 column it lands
 *  in. The client schema already enforces this shape, but the action is a
 *  reachable POST endpoint on its own — without the range half, a long digit
 *  string became an out-of-range BigInt and the INSERT failed with an HTTP 500
 *  instead of the normal `{ok:false}` validation-error path.
 *  Conversion itself lives in lib/utils/money.ts (AGENTS.md: only that module
 *  converts money) and is exact — no Number round-trip. */
function parseAmountMajor(value: string | undefined): bigint | null {
  if (value === undefined) return null;
  return parseMajorAmountToMinor(value);
}

/** Converts the client-facing form shape (major-unit amount strings, plain
 *  date string) into the shape lib/validators/goal.ts's `goalSchema` expects
 *  (bigint minor units) — client validation is UX only, this + the
 *  goalSchema.safeParse below is the real gate. */
function toDomainInput(input: ClientGoalInput & { selfConcordance?: SelfConcordanceAnswers }) {
  if (input.kind === "financial") {
    const target = parseAmountMajor(input.targetAmountMajor);
    const initial = input.initialAmountMajor ? parseAmountMajor(input.initialAmountMajor) : 0n;

    return {
      kind: "financial" as const,
      title: input.title,
      description: input.description || undefined,
      deadline: input.deadline,
      currency: input.currencySymbol,
      // Leave undefined on bad/out-of-range input rather than throw — goalSchema
      // then fails validation cleanly (targetAmount is a required positive
      // bigint bounded by MAX_INT8).
      targetAmount: target ?? undefined,
      initialAmount: initial ?? undefined,
      selfConcordance: input.selfConcordance,
      // "" (unset in the HTML select) must map to null, not be dropped — a
      // clearing edit needs SQL NULL to actually reach `.set({...values})`.
      sphere: input.sphere ? input.sphere : null,
    };
  }

  return {
    kind: "non_financial" as const,
    title: input.title,
    description: input.description || undefined,
    deadline: input.deadline,
    // nonFinancialGoalSchema declares these as z.undefined() (not
    // .optional()) — Zod v4 treats a merely-absent key as invalid there
    // (only an explicit `undefined` value satisfies it), so they must be
    // set, not omitted.
    currency: undefined,
    targetAmount: undefined,
    initialAmount: undefined,
    selfConcordance: input.selfConcordance,
    sphere: input.sphere ? input.sphere : null,
  };
}

function toInsertValues(data: GoalInput): Omit<NewGoal, "userId"> {
  const common = {
    title: data.title,
    description: data.description ?? null,
    // Already the canonical "yyyy-MM-dd" key the date column stores —
    // goalSchema validates it as a real calendar date without a Date hop
    // (lib/validators/date-key.ts), so there is nothing left to convert.
    deadline: data.deadline,
    // Explicit `undefined` (not `?? null`) so an edit-mode update — which
    // never carries selfConcordance (see toDomainInput's caller in
    // updateGoal) — leaves the column untouched rather than nulling out a
    // previously-saved concordance answer (drizzle's `.set()` drops
    // undefined-valued keys; a plain insert falls back to the column
    // default/NULL for them).
    selfConcordance: data.selfConcordance,
    // Explicit null (never left undefined) so clearing the sphere on edit
    // actually writes SQL NULL instead of `.set()` silently dropping the key.
    sphere: data.sphere ?? null,
  };

  if (data.kind === "financial") {
    return {
      ...common,
      kind: "financial",
      currency: data.currency,
      targetAmount: data.targetAmount,
      initialAmount: data.initialAmount,
    };
  }

  return {
    ...common,
    kind: "non_financial",
    currency: null,
    targetAmount: null,
    initialAmount: null,
  };
}

/** progress_pct for goal_archived (§8.4) — same formula the dashboard query
 *  uses (lib/db/queries/goals.ts `goalProgress`, not exported), recomputed
 *  here from already-fetched GoalWithProgress fields (no extra DB read). */
function calcProgressPct(goal: GoalWithProgress): number {
  if (goal.kind === "financial") {
    return Math.round(calcFinancialProgress(goal.saved, goal.targetAmount ?? 0n) * 100);
  }
  if (goal.checklistTotal > 0) {
    return Math.round((goal.checklistDone / goal.checklistTotal) * 100);
  }
  return goal.manualProgress ?? 0;
}

export async function createGoal(
  input: ClientGoalInput & { selfConcordance?: SelfConcordanceAnswers; woop?: WoopInput },
): Promise<GoalActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsed = goalSchema.safeParse(toDomainInput(input));
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "createGoal: validation failed");
    return { ok: false, error: GENERIC_VALIDATION_ERROR };
  }

  const woopParsed = woopInputSchema.optional().safeParse(input.woop);
  if (!woopParsed.success) {
    log.warn({ issues: woopParsed.error.issues }, "createGoal: woop validation failed");
    return { ok: false, error: GENERIC_VALIDATION_ERROR };
  }

  const { goal, woop } = await insertGoalWithWoop(
    user.id,
    toInsertValues(parsed.data),
    woopParsed.data ?? null,
  );

  const hasWoop = woop !== null;
  if (hasWoop) {
    track({ name: "woop_completed", goal_id: goal.id });
  }

  track({
    name: "goal_created",
    goal_id: goal.id,
    goal_kind: goal.kind,
    currency: goal.currency ?? undefined,
    kind: goal.kind,
    has_woop: hasWoop,
    has_concordance: goal.selfConcordance != null,
    checklist_size: 0,
  });
  log.info({ goalId: goal.id, kind: goal.kind }, "goal created");

  revalidatePath("/");
  revalidatePath(`/goals/${goal.id}`);

  return { ok: true, goalId: goal.id };
}

export async function updateGoal(
  /** `expectedUpdatedAt` is the goal's `updatedAt` as of the render that
   *  produced this payload, ISO-encoded — the optimistic token from GA-012. */
  input: ClientGoalInput & { id: string; expectedUpdatedAt: string },
): Promise<GoalActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const idCheck = goalIdSchema.safeParse(input.id);
  if (!idCheck.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const existing = await getGoalWithDetails(user.id, input.id);
  if (!existing) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  // The edit UI keeps kind fixed, but a Server Action is a reachable POST
  // endpoint on its own (Next 16 docs) — re-assert the invariant server-side.
  if (input.kind !== existing.kind) {
    return { ok: false, error: "Тип цели нельзя изменить" };
  }

  const parsed = goalUpdateSchema.safeParse({ ...toDomainInput(input), id: input.id });
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "updateGoal: validation failed");
    return { ok: false, error: GENERIC_VALIDATION_ERROR };
  }

  const expected = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) {
    return { ok: false, error: GENERIC_INVALID_ID_ERROR };
  }

  // The currency-lock invariant (PRD §3.2) and the stale-edit check both live
  // inside updateGoalWithRevision now, under the goal row lock — checking
  // either one here, in its own round trip, is exactly the race GA-016
  // describes. Sphere-only edits still update without creating a revision.
  const values = toInsertValues(parsed.data);
  const outcome = await updateGoalWithRevision(
    user.id,
    input.id,
    {
      ...values,
      title: values.title,
      description: values.description ?? null,
      deadline: values.deadline,
    },
    expected,
  );

  if (outcome.status === "not_found") return { ok: false, error: GENERIC_NOT_FOUND_ERROR };
  if (outcome.status === "currency_locked") {
    return { ok: false, error: "Валюту нельзя изменить: по цели уже есть взносы" };
  }
  if (outcome.status === "stale") {
    log.info({ goalId: input.id }, "updateGoal rejected: form was rendered from an older version");
    return { ok: false, error: STALE_GOAL_ERROR, stale: true };
  }

  const updated = outcome.goal;
  log.info({ goalId: updated.id }, "goal updated");
  revalidatePath("/");
  revalidatePath(`/goals/${updated.id}`);

  return { ok: true, goalId: updated.id };
}

export async function archiveGoal(goalId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const existing = await getGoalWithDetails(user.id, goalId);
  if (!existing) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  const result = await setGoalStatus(user.id, goalId, "archived");
  if (!result.ok) return { ok: false, error: statusErrorFor(result) };

  const updated = result.goal;

  // An archived goal is no longer active, so it must stop being the focus goal
  // — otherwise the dashboard/today badge keeps pointing at it (getFocusGoal
  // already filters by status, leaving the two views disagreeing).
  await clearFocusIfPointingAt(user, goalId);

  if (result.changed) {
    track({
      name: "goal_archived",
      goal_id: updated.id,
      goal_kind: updated.kind,
      currency: updated.currency ?? undefined,
      kind: updated.kind,
      progress_pct: calcProgressPct(existing),
    });
    log.info({ goalId }, "goal archived");
  }

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}

export async function softDeleteGoalAction(goalId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const existing = await getGoalWithDetails(user.id, goalId);
  if (!existing) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  // Zero rows means the goal was already deleted (or stopped being ours)
  // between the read above and this write — a concurrent tab got there first.
  // Report it exactly like a goal that was never there, instead of logging a
  // delete that did not happen (GA-024).
  // GA-025: the focus pointer and the goal's children are cleared inside this
  // same transaction now, so there is no window in which the goal is gone but
  // the user is still focused on it.
  const deletedId = await softDeleteGoal(user.id, goalId);
  if (!deletedId) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  log.info({ goalId }, "goal soft-deleted");

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}

export async function markAchieved(goalId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const existing = await getGoalWithDetails(user.id, goalId);
  if (!existing) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  const result = await setGoalStatus(user.id, goalId, "achieved");
  if (!result.ok) return { ok: false, error: statusErrorFor(result) };

  const updated = result.goal;

  // Achieved goals aren't active, so they can't stay the focus goal (same
  // reasoning as archiveGoal).
  await clearFocusIfPointingAt(user, goalId);

  if (!result.changed) {
    // Already achieved — idempotent success, and notably achievedAt was left
    // exactly where it was rather than being pushed forward.
    revalidatePath("/");
    revalidatePath("/today");
    revalidatePath(`/goals/${goalId}`);
    return { ok: true };
  }

  const achievedAt = updated.achievedAt ?? new Date();
  const daysToAchieve = Math.max(
    0,
    Math.round((achievedAt.getTime() - existing.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // progress_events_count (§8.4): no cheap count query is in scope for T6
  // (lib/db/queries/contributions.ts isn't part of this task's granted
  // imports, and contributions/checklist aren't implemented yet) — reporting
  // 0, per the spec's explicit "use contributions count if cheap, else 0".
  track({
    name: "goal_achieved",
    goal_id: updated.id,
    goal_kind: updated.kind,
    currency: updated.currency ?? undefined,
    kind: updated.kind,
    days_to_achieve: daysToAchieve,
    progress_events_count: 0,
  });
  log.info({ goalId, daysToAchieve }, "goal achieved");

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}
