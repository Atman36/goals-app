import Link from "next/link";

import { checkinOutcomeValues } from "@/lib/validators/checkin";
import { WEEK_OUTCOME_LABELS, type PromiseCardState } from "@/lib/utils/promise-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// T6 (PLAN §5 B2). Renders ONE state produced by lib/utils/promise-card.ts.
//
// Tone rules, fixed by the spec and not to be softened or sharpened later:
// no «ты обещал» / «ты не сделал», no exclamation marks, no red, no overdue
// counters, no judging emoji. The days-left line is descriptive — it does not
// change colour or weight as the week runs out.

/** The compact card is one tap away from the week itself — everything the
 *  promise needs (edit, outcome, if-then) lives on /reflections. */
const WEEK_HREF = "/reflections";

const cardLinkClassName =
  "flex flex-col gap-1 rounded-xl bg-card px-4 py-4 text-sm ring-1 ring-foreground/8 transition-colors hover:bg-muted";

export function WeeklyPromiseCard({ state }: { state: PromiseCardState }) {
  if (state.kind === "unclosed-previous") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Неделя закрылась. Чем закончилось обещание?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.goalTitle ? (
            <p className="truncate text-xs text-muted-foreground">{state.goalTitle}</p>
          ) : null}
          <p className="truncate text-sm text-foreground">«{state.promise}»</p>
          {/* One tap closes the cycle: each button opens the week's form with
              the outcome preselected (the save is still the form's button). */}
          <div className="flex flex-wrap gap-2">
            {checkinOutcomeValues.map((outcome) => (
              <Button
                key={outcome}
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link href={`${WEEK_HREF}?prevOutcome=${outcome}`}>
                    {WEEK_OUTCOME_LABELS[outcome]}
                  </Link>
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "none") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Обещание на эту неделю не задано</span>
        <Link href={WEEK_HREF} className="font-semibold text-primary hover:underline">
          Открыть неделю
        </Link>
      </div>
    );
  }

  // `current` and `no-goal-link` differ only in the goal line: a promise whose
  // goal was deleted keeps its own text, it just has nothing left to name.
  const goalLine = state.kind === "current" ? state.goalTitle : "цель удалена";

  return (
    <Link href={WEEK_HREF} className={cardLinkClassName}>
      <span className="text-xs font-medium text-muted-foreground">Обещание недели</span>
      {goalLine ? <span className="truncate text-xs text-muted-foreground">{goalLine}</span> : null}
      <span className="truncate font-medium text-foreground">{state.promise}</span>
      <span className="text-xs text-muted-foreground">
        {state.daysLeft === 0 ? "последний день недели" : `до конца недели ${state.daysLeft} дн.`}
      </span>
    </Link>
  );
}
