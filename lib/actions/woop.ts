"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { getWoopByGoal, insertWoopEntry, touchWoopLived, updateWoopEntry } from "@/lib/db/queries/woop";
import { goalIdSchema } from "@/lib/validators/goal";
import { woopInputSchema, type WoopInput } from "@/lib/validators/woop";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import type { SimpleActionResult } from "@/lib/actions/goals";

const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_VALIDATION_ERROR = "Проверьте поля формы";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";

/** Goal page's WOOP block (T12) — one entry per goal, latest wins (Decision
 *  1): inserts if the goal has none yet, otherwise updates the 4 fields in
 *  place. The analytics event below is tracked only on the insert path —
 *  editing an existing entry doesn't re-fire it. */
export async function saveWoop(goalId: string, input: WoopInput): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const parsed = woopInputSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "saveWoop: validation failed");
    return { ok: false, error: GENERIC_VALIDATION_ERROR };
  }

  const existingGoal = await getGoalWithDetails(user.id, goalId);
  if (!existingGoal) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  const existingWoop = await getWoopByGoal(user.id, goalId);
  const saved = existingWoop
    ? await updateWoopEntry(user.id, goalId, parsed.data)
    : await insertWoopEntry(user.id, goalId, parsed.data);
  if (!saved) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  if (!existingWoop) {
    track({ name: "woop_completed", goal_id: goalId });
  }
  log.info({ goalId, isNew: !existingWoop }, "woop saved");

  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}

/** «Прожить образ» — records that the owner just mentally re-lived the WOOP
 *  image (Decision 2). No analytics event for this per T12's spec. */
export async function markWoopLived(goalId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const existingGoal = await getGoalWithDetails(user.id, goalId);
  if (!existingGoal) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  const updated = await touchWoopLived(user.id, goalId);
  if (!updated) return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  log.info({ goalId }, "woop lived touched");

  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}
