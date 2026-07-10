import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { pluralRu } from "@/lib/utils/plural";

/** Weekly activity streak — consecutive weeks with a contribution or a closed
 *  step. Renders nothing when the streak is zero. */
export function StreakBadge({ weeks, className }: { weeks: number; className?: string }) {
  if (weeks <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-3 py-1 text-sm font-semibold text-warn",
        className,
      )}
    >
      <Flame className="size-4" aria-hidden />
      {weeks} {pluralRu(weeks, "неделя", "недели", "недель")} подряд
    </span>
  );
}
