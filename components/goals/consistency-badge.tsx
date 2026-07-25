import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsistencyBadgeState } from "@/lib/utils/consistency-badge";

/** Rolling weekly consistency — "N of the last 4 weeks", replacing the streak
 *  that zeroed on the first miss (T8 / PLAN §6 C1). Renders nothing until
 *  there is at least one active week.
 *
 *  Markup and styling are deliberately identical to the old badge: the verdict
 *  was about what the number means, not about how the pill looks. The wording
 *  itself is computed by lib/utils/consistency-badge.ts, so it can be tested
 *  without a render. */
export function ConsistencyBadge({
  state,
  className,
}: {
  state: ConsistencyBadgeState;
  className?: string;
}) {
  if (!state.visible) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-3 py-1 text-sm font-semibold text-warn",
        className,
      )}
    >
      <Flame className="size-4" aria-hidden />
      {state.label}
    </span>
  );
}
