"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  insertGoal,
  updateGoal as updateGoalQuery,
  softDeleteGoal,
  setGoalStatus,
  getGoalWithDetails,
  hasContributions,
  type GoalWithProgress,
} from "@/lib/db/queries/goals";
import type { NewGoal } from "@/lib/db/schema";
import { goalSchema, goalUpdateSchema, goalIdSchema, type GoalInput } from "@/lib/validators/goal";
import { toMinorUnits, calcFinancialProgress } from "@/lib/utils/money";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import type { ClientGoalInput } from "@/components/goals/goal-form-schema";

export type GoalActionResult =
  | { ok: true; goalId: string }
  | { ok: false; error: string };

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_VALIDATION_ERROR = "Проверьте поля формы";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";

/** Parses a major-unit amount string into a non-negative integer number, or
 *  null if it isn't one. The client schema already enforces this shape, but
 *  the action is a reachable POST endpoint on its own — this guards
 *  `toMinorUnits` from being handed NaN/garbage (which throws) so malformed
 *  input turns into the normal `{ok:false}` validation-error path instead of
 *  an unhandled exception. */
function parseAmountMajor(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Converts the client-facing form shape (major-unit amount strings, plain
 *  date string) into the shape lib/validators/goal.ts's `goalSchema` expects
 *  (bigint minor units) — client validation is UX only, this + the
 *  goalSchema.safeParse below is the real gate. */
function toDomainInput(input: ClientGoalInput) {
  if (input.kind === "financial") {
    const target = parseAmountMajor(input.targetAmountMajor);
    const initial = input.initialAmountMajor ? parseAmountMajor(input.initialAmountMajor) : 0;

    return {
      kind: "financial" as const,
      title: input.title,
      description: input.description || undefined,
      deadline: input.deadline,
      currency: input.currencySymbol,
      // Leave undefined on bad input rather than throw — goalSchema then
      // fails validation cleanly (targetAmount is a required positive bigint).
      targetAmount: target === null ? undefined : toMinorUnits(target),
      initialAmount: initial === null ? undefined : toMinorUnits(initial),
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
  };
}

/** Date-only round trip: goalSchema's z.coerce.date() parses a "yyyy-MM-dd"
 *  string as UTC midnight, so slicing the ISO string back gives the same
 *  calendar date regardless of the server's local timezone. */
function toDbDeadline(deadline: Date): string {
  return deadline.toISOString().slice(0, 10);
}

function toInsertValues(data: GoalInput): Omit<NewGoal, "userId"> {
  const common = {
    title: data.title,
    description: data.description ?? null,
    deadline: toDbDeadline(data.deadline),
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

export async function createGoal(input: ClientGoalInput): Promise<GoalActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsed = goalSchema.safeParse(toDomainInput(input));
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "createGoal: validation failed");
    return { ok: false, error: GENERIC_VALIDATION_ERROR };
  }

  const goal = await insertGoal(user.id, toInsertValues(parsed.data));

  track({
    name: "goal_created",
    goal_id: goal.id,
    goal_kind: goal.kind,
    currency: goal.currency ?? undefined,
    kind: goal.kind,
    has_woop: false,
    has_concordance: false,
    checklist_size: 0,
  });
  log.info({ goalId: goal.id, kind: goal.kind }, "goal created");

  revalidatePath("/");
  revalidatePath(`/goals/${goal.id}`);

  return { ok: true, goalId: goal.id };
}

export async function updateGoal(
  input: ClientGoalInput & { id: string },
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

  // Currency-lock invariant (PRD §3.2): a goal's currency may only change
  // while it has zero non-deleted contributions. Requires a DB read, so it
  // can't be a static Zod rule — enforced here, not only by disabling the
  // input client-side.
  if (parsed.data.kind === "financial" && existing.kind === "financial") {
    if (parsed.data.currency !== existing.currency) {
      const locked = await hasContributions(user.id, input.id);
      if (locked) {
        return { ok: false, error: "Валюту нельзя изменить: по цели уже есть взносы" };
      }
    }
  }

  const updated = await updateGoalQuery(user.id, input.id, toInsertValues(parsed.data));
  if (!updated) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

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

  const updated = await setGoalStatus(user.id, goalId, "archived");
  if (!updated) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  track({
    name: "goal_archived",
    goal_id: updated.id,
    goal_kind: updated.kind,
    currency: updated.currency ?? undefined,
    kind: updated.kind,
    progress_pct: calcProgressPct(existing),
  });
  log.info({ goalId }, "goal archived");

  revalidatePath("/");
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

  await softDeleteGoal(user.id, goalId);
  log.info({ goalId }, "goal soft-deleted");

  revalidatePath("/");
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

  const updated = await setGoalStatus(user.id, goalId, "achieved");
  if (!updated) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

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
  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}
