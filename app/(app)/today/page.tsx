import { permanentRedirect } from "next/navigation";

/**
 * The daily loop moved to the home page. /today keeps existing as a permanent
 * redirect rather than a 404: it was the entry point people were sent to for
 * the whole of Phase 1, and external links and bookmarks still point at it.
 *
 * Nothing revalidates it any more — T1 removed all 11 `revalidatePath("/today")`
 * calls, because a redirect has no rendered output to invalidate.
 *
 * `permanentRedirect` (308), not `redirect` (307): the move is not temporary.
 */
export default function TodayPage() {
  permanentRedirect("/");
}
