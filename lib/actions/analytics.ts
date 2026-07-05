"use server";

import { getCurrentUser } from "@/lib/auth";
import { track } from "@/lib/analytics/events";
import { goalIdSchema } from "@/lib/validators/goal";

/**
 * Fire-and-forget analytics ping for purely client-side interactions that
 * don't otherwise touch the server — e.g. opening the goal gallery lightbox
 * (PRD §8.4 `gallery_opened`). `track()` writes through the server-only pino
 * logger (lib/log.ts), so a "use client" component can't call it directly;
 * this is the minimal Server Action bridge for that one event.
 *
 * Like every Server Action, this is a reachable public POST endpoint on its
 * own — auth + input are gated, but analytics must never break UX, so both
 * failures are silent no-ops rather than surfaced errors.
 */
export async function trackGalleryOpened(goalId: string): Promise<void> {
  await getCurrentUser();

  const parsed = goalIdSchema.safeParse(goalId);
  if (!parsed.success) return;

  track({ name: "gallery_opened", goal_id: parsed.data, scope: "goal" });
}
