"use server";

import { track } from "@/lib/analytics/events";

/**
 * Fire-and-forget analytics ping for purely client-side interactions that
 * don't otherwise touch the server — e.g. opening the goal gallery lightbox
 * (PRD §8.4 `gallery_opened`). `track()` writes through the server-only pino
 * logger (lib/log.ts), so a "use client" component can't call it directly;
 * this is the minimal Server Action bridge for that one event.
 */
export async function trackGalleryOpened(goalId: string): Promise<void> {
  track({ name: "gallery_opened", goal_id: goalId, scope: "goal" });
}
