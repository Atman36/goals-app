import { addDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrajectoryWeek, WeekCheckinSummary } from "@/lib/utils/trajectory";
import { FEELING_LABELS, OUTCOME_LABELS } from "@/lib/checkin-labels";

function checkinSummaryLine(summary: WeekCheckinSummary): string {
  // Outcome/feeling wording comes from the shared check-in copy
  // (lib/checkin-labels.ts); outcomes are lowercased for this inline summary.
  const base = `Чек-ины: ${summary.total} (${OUTCOME_LABELS.done.toLowerCase()} ${summary.done} · ${OUTCOME_LABELS.partial.toLowerCase()} ${summary.partial} · ${OUTCOME_LABELS.skipped.toLowerCase()} ${summary.skipped})`;
  if (summary.avgFeeling === null) return base;
  const label = FEELING_LABELS[Math.round(summary.avgFeeling)];
  return label ? `${base} · состояние: ${label}` : base;
}

function weekRangeLabel(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  return `${format(start, "d MMMM", { locale: ru })} – ${format(end, "d MMMM", { locale: ru })}`;
}

/** «Траектория»: a goal's path over time, assembled by buildTrajectory and shown
 *  newest week first. It shows events and context by time — it does NOT depict
 *  obligatory growth; dips are honest, first-class outcomes. Server component
 *  (no client state); renders nothing when there are no weeks. */
export function TrajectoryBlock({ weeks }: { weeks: TrajectoryWeek[] }) {
  if (weeks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Траектория</CardTitle>
        <CardDescription>События пути по неделям — без обязательного роста</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {weeks.map((week) => (
          <div key={week.weekStart} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{weekRangeLabel(week.weekStart)}</span>
              {week.checkins ? (
                <span className="text-xs text-muted-foreground">{checkinSummaryLine(week.checkins)}</span>
              ) : null}
            </div>

            {week.events.length > 0 ? (
              <ol className="flex flex-col">
                {week.events.map((event, i) => (
                  <li key={`${event.dateKey}-${event.kind}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center" aria-hidden>
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/60" />
                      {i < week.events.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                    </div>
                    <div className="flex flex-1 flex-col pb-4">
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(event.dateKey), "d MMM", { locale: ru })}
                      </span>
                      <span className="text-sm font-medium">{event.text}</span>
                      {event.detail ? (
                        <span className="text-sm text-muted-foreground">{event.detail}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
