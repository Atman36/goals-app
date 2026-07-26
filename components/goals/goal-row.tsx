import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { calcFinancialProgress, formatMoney } from "@/lib/utils/money";
import { pluralRu } from "@/lib/utils/plural";
import type { GoalWithProgress } from "@/lib/db/queries/goals";
import type { Currency } from "@/lib/validators/goal";

/** Mirrors the (unexported) goalProgress() in lib/db/queries/goals.ts and
 *  goal-card.tsx, per PRD §4. Kept in step with goal-card deliberately: two
 *  surfaces showing different percentages for the same goal is worse than the
 *  duplication. */
function goalProgress(goal: GoalWithProgress): number {
  if (goal.kind === "financial") {
    // Invariant enforced by lib/validators/goal.ts: financial ⇒ currency & targetAmount set.
    return calcFinancialProgress(goal.saved, goal.targetAmount ?? 0n);
  }
  if (goal.checklistTotal > 0) return goal.checklistDone / goal.checklistTotal;
  return 0;
}

/**
 * One line of «Куда это ведёт» on the home page: title, a thin progress bar and
 * a single caption.
 *
 * Money is the point of the caption, not of a tile of its own — the redesign
 * moved sums out of the hero and into the line they belong to. Every amount
 * goes through formatMoney (bigint minor units, lib/utils/money.ts); there is
 * no number arithmetic on money anywhere in this file.
 */
export function GoalRow({ goal, isFocus }: { goal: GoalWithProgress; isFocus: boolean }) {
  const isFinancial = goal.kind === "financial";
  const percent = Math.round(goalProgress(goal) * 100);

  const metric = isFinancial
    ? `${formatMoney(goal.saved, goal.currency as Currency)} из ${formatMoney(goal.targetAmount ?? 0n, goal.currency as Currency)}`
    : `${goal.checklistDone} из ${goal.checklistTotal} ${pluralRu(goal.checklistTotal, "шага", "шагов", "шагов")}`;

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="-mx-2 flex flex-col gap-[7px] rounded-xl px-2 py-2 transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        {isFocus ? (
          <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-secondary px-[7px] font-mono text-[10.5px] font-medium text-foreground">
            №1
          </span>
        ) : null}
        <span className="truncate text-[14.5px] font-bold text-foreground">{goal.title}</span>
      </div>
      <span
        aria-hidden
        className="block h-[5px] overflow-hidden rounded-full bg-secondary"
      >
        <span
          className={`block h-full bg-primary ${isFocus ? "" : "opacity-55"}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        {metric} · до {format(parseISO(goal.deadline), "d MMMM", { locale: ru })}
      </span>
    </Link>
  );
}
