"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { upsertCheckinRow } from "@/lib/db/queries/checkins";
import { checkinInputSchema } from "@/lib/validators/checkin";
import { todayKey } from "@/lib/utils/date-keys";
import { withRequestId } from "@/lib/log";
import type { SimpleActionResult } from "@/lib/actions/goals";

// Not exported from lib/actions/goals.ts — replicated here (same Russian
// strings) rather than editing that file, per this task's boundaries. Same
// pattern as lib/actions/focus.ts.
const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";

/** Saves (upserts) today's check-in for a goal — one per (goal, UTC day);
 *  re-saving the same day updates it. Only active goals owned by the current
 *  user accept a check-in (growth-reactor v5 §5/§6/§12). */
export async function saveCheckin(input: unknown): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsed = checkinInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const goal = await getGoalWithDetails(user.id, parsed.data.goalId);
  if (!goal || goal.status !== "active") return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  const date = todayKey();

  await upsertCheckinRow({
    goalId: parsed.data.goalId,
    date,
    outcome: parsed.data.outcome,
    feeling: parsed.data.feeling,
    note: parsed.data.note,
  });
  log.info({ goalId: parsed.data.goalId, date }, "checkin saved");

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${parsed.data.goalId}`);

  return { ok: true };
}
