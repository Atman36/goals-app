import { addDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { getCurrentUser } from "@/lib/auth";
import {
  countCompletedCycles,
  getLatestReflectionBefore,
  getReflectionByWeek,
  listReflections,
} from "@/lib/db/queries/reflections";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { Badge } from "@/components/ui/badge";
import { ReflectionForm } from "@/app/(app)/reflections/reflection-form";

// Reuses check-in wording, except "не в этот раз" replaces "не сегодня" — a
// promise's fate over a week, not a single day (Decisions).
const PREV_OUTCOME_LABELS: Record<string, string> = {
  done: "Сделал",
  partial: "Частично",
  skipped: "Не в этот раз",
};

export default async function ReflectionsPage() {
  const user = await getCurrentUser();
  const weekStart = weekStartKey(todayKey());
  const weekEnd = addDays(parseISO(weekStart), 6);

  const [current, prev, history, cycles] = await Promise.all([
    getReflectionByWeek(user.id, weekStart),
    getLatestReflectionBefore(user.id, weekStart),
    listReflections(user.id, 12),
    countCompletedCycles(user.id),
  ]);

  const subtitle = `${format(parseISO(weekStart), "d MMMM", { locale: ru })} – ${format(weekEnd, "d MMMM yyyy", { locale: ru })}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Рефлексия недели</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {cycles > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Завершённых недельных циклов: {cycles}</p>
        ) : null}
      </div>

      <ReflectionForm current={current} prevPromise={prev?.promise ?? null} />

      {history.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight">История</h2>
          <div className="flex flex-col gap-2">
            {history.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-2xl bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(r.weekStart), "d MMMM yyyy", { locale: ru })}
                  </span>
                  {r.prevOutcome ? (
                    <Badge variant="secondary">{PREV_OUTCOME_LABELS[r.prevOutcome]}</Badge>
                  ) : null}
                </div>
                {r.promise ? <p className="text-sm">{r.promise}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
