import { cn } from "@/lib/utils";
import type { ConsistencyBadgeState } from "@/lib/utils/consistency-badge";

/** Rolling weekly consistency — "N of the last 4 weeks", replacing the streak
 *  that zeroed on the first miss (T8 / PLAN §6 C1). Renders nothing until
 *  there is at least one active week.
 *
 *  Home redesign B4/C1: the flame pill is gone. A flame is a burning metaphor,
 *  and there is nothing left in the product that burns — the streak that could
 *  be lost was removed on purpose. What replaces it is four plain bars, one per
 *  week of the window, filled for the weeks that had activity.
 *
 *  Nothing is drawn on day zero, bars included: four empty cells read as a
 *  scale someone failed to fill, which is precisely the reproach the redesign
 *  exists to remove. `state.visible` already encodes that, and `state.weeks` is
 *  empty alongside it.
 *
 *  The wording is computed by lib/utils/consistency-badge.ts so it can be
 *  tested without a render; the bars come from real week keys, not from a
 *  count, so a filled cell always names a week that actually happened. */
export function ConsistencyBadge({
  state,
  className,
}: {
  state: ConsistencyBadgeState;
  className?: string;
}) {
  if (!state.visible) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {state.weeks.length > 0 ? (
        // aria-hidden: the label right below says the same thing in words, and
        // the bars carry no information the sentence doesn't (never colour or
        // shape alone — growth-reactor v5 §5).
        <div aria-hidden className="grid grid-flow-col auto-cols-fr gap-1.5">
          {state.weeks.map((week) => (
            <span
              key={week.weekStart}
              className="h-[7px] overflow-hidden rounded-full bg-secondary"
            >
              {week.active ? <span className="block h-full bg-foreground/70" /> : null}
            </span>
          ))}
        </div>
      ) : null}
      <span className="text-sm font-semibold text-foreground">{state.label}</span>
    </div>
  );
}
