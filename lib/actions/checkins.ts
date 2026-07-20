"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { upsertCheckinRow } from "@/lib/db/queries/checkins";
import { checkinInputSchema, resolveCheckinDate } from "@/lib/validators/checkin";
import { withRequestId } from "@/lib/log";

/** Like SimpleActionResult, plus the one failure the UI must handle
 *  differently: `stale` means nothing was written and a reload is required
 *  (the rendered day is no longer today) — GA-013. */
export type CheckinActionResult =
  | { ok: true }
  | { ok: false; error: string; stale?: boolean };

// Not exported from lib/actions/goals.ts — replicated here (same Russian
// strings) rather than editing that file, per this task's boundaries. Same
// pattern as lib/actions/focus.ts.
const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";
const STALE_DAY_ERROR =
  "День сменился, пока форма была открыта — чек-ин не сохранён. Обновите страницу, чтобы отметить новый день.";

/** Saves (upserts) today's check-in for a goal — one per (goal, UTC day);
 *  re-saving the same day updates it. Only active goals owned by the current
 *  user accept a check-in (growth-reactor v5 §5/§6/§12).
 *
 *  The day is never taken from the client: the form posts back the day it was
 *  rendered for (`expectedDate`) purely so this action can detect a UTC
 *  midnight crossed between render and submit and refuse the write instead of
 *  filing the answers under the wrong day — see the day-token contract in
 *  lib/validators/checkin.ts (GA-013). */
export async function saveCheckin(input: unknown): Promise<CheckinActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsed = checkinInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  // GA-013: reject rather than silently re-key the check-in to D+1. Checked
  // before the goal read so a stale submit costs no query.
  const resolved = resolveCheckinDate(parsed.data.expectedDate);
  if (!resolved.ok) {
    log.info({ goalId: parsed.data.goalId }, "checkin rejected: rendered day is no longer today");
    return { ok: false, error: STALE_DAY_ERROR, stale: true };
  }
  const date = resolved.date;

  const goal = await getGoalWithDetails(user.id, parsed.data.goalId);
  if (!goal || goal.status !== "active") return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  // GA-015: the goal read above stays (it is what enforces "active only"), but
  // the write re-verifies liveness under a row lock — null means the goal was
  // deleted in the meantime, which must not be reported as a saved check-in.
  const saved = await upsertCheckinRow(user.id, {
    goalId: parsed.data.goalId,
    date,
    outcome: parsed.data.outcome,
    feeling: parsed.data.feeling,
    note: parsed.data.note,
  });
  if (!saved) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };
  log.info({ goalId: parsed.data.goalId, date }, "checkin saved");

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${parsed.data.goalId}`);

  return { ok: true };
}
