"use server";

import { getCurrentUser } from "@/lib/auth";
import { track } from "@/lib/analytics/events";
import { canReadGoal } from "@/lib/db/queries/goals";
import { goalIdSchema } from "@/lib/validators/goal";

/**
 * Fire-and-forget analytics ping for purely client-side interactions that
 * don't otherwise touch the server — e.g. opening the goal gallery lightbox
 * (PRD §8.4 `gallery_opened`). `track()` writes through the server-only pino
 * logger (lib/log.ts), so a "use client" component can't call it directly;
 * this is the minimal Server Action bridge for that one event.
 *
 * Like every Server Action, this is a reachable public POST endpoint on its
 * own — auth + input are gated, but analytics must never break UX, so every
 * failure is a silent no-op rather than a surfaced error.
 *
 * A syntactically valid UUID is not a capability (GA-026 / CR-022): without
 * the readability check below, any signed-in caller could post a guessed or
 * borrowed goal id and have it logged as if they had opened that gallery,
 * contaminating the funnels the four-week trial is judged on and carrying a
 * foreign identifier into the analytics stream. Rejection is silent and
 * uniform for foreign, deleted, missing and malformed ids alike, so the action
 * never becomes an existence oracle.
 */
export async function trackGalleryOpened(goalId: string): Promise<void> {
  const user = await getCurrentUser();

  const parsed = goalIdSchema.safeParse(goalId);
  if (!parsed.success) return;

  if (!(await canReadGoal(user.id, parsed.data))) return;

  track({ name: "gallery_opened", goal_id: parsed.data, scope: "goal" });
}
