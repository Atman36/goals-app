"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { setUserFocusGoal } from "@/lib/db/queries/users";
import { goalIdSchema } from "@/lib/validators/goal";
import { withRequestId } from "@/lib/log";
import type { SimpleActionResult } from "@/lib/actions/goals";

// Not exported from lib/actions/goals.ts — replicated here (same Russian
// strings) rather than editing that file, per T3's boundaries.
const GENERIC_NOT_FOUND_ERROR = "Цель не найдена";
const GENERIC_INVALID_ID_ERROR = "Некорректные данные";

export async function setFocusGoal(goalId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsedId = goalIdSchema.safeParse(goalId);
  if (!parsedId.success) return { ok: false, error: GENERIC_INVALID_ID_ERROR };

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal || goal.status !== "active") return { ok: false, error: GENERIC_NOT_FOUND_ERROR };

  await setUserFocusGoal(user.id, goalId);
  log.info({ goalId }, "focus goal set");

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}

export async function clearFocusGoal(): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  await setUserFocusGoal(user.id, null);
  log.info({ userId: user.id }, "focus goal cleared");

  revalidatePath("/");
  revalidatePath("/today");

  return { ok: true };
}
