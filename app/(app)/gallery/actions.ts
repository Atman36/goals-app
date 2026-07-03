"use server";

import { track } from "@/lib/analytics/events";

/**
 * Client-side bridge for the global gallery's `gallery_opened {scope:"global"}`
 * event (PRD §8.4 / §3.4). Mirrors lib/actions/analytics.ts's
 * trackGalleryOpened (T8, goal-scoped) but lives inside this route's own
 * boundary rather than editing that file, which only ever tracks scope:"goal".
 */
export async function trackGlobalGalleryOpened(): Promise<void> {
  track({ name: "gallery_opened", scope: "global" });
}
