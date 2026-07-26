import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { getCurrentUser } from "@/lib/auth";
import { getMetricsData } from "@/lib/db/queries/metrics";
import {
  lastNWeekStarts,
  completedCycles,
  promiseOutcomeMix,
  checkinCoverage,
  checkinOutcomeMix,
  feelingByOutcome,
  gapsAndReturns,
  returnRhythm,
  rollingConsistency,
  ifThenCoverage,
  orphanPromises,
  planAdjustmentMix,
} from "@/lib/metrics/definitions";
import { weekStartKey } from "@/lib/utils/week-keys";
import { todayKey } from "@/lib/utils/date-keys";
import { OUTCOME_LABELS } from "@/lib/checkin-labels";
import { gapCellLabel, returnRhythmSummary } from "@/lib/utils/return-rhythm-labels";
import { EmptyState } from "@/components/goals/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Decision 2 (T2 spec): four weeks of observation plus four weeks of prior
// context to compare against.
const METRICS_WINDOW_WEEKS = 8;
// Below this many active weeks the summary numbers are mostly noise —
// "данных мало" has to say so plainly instead of presenting them as fact.
const MIN_WEEKS_FOR_SIGNAL = 2;

const OUTCOMES = ["done", "partial", "skipped"] as const;

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function avgLabel(avg: number | null): string {
  return avg === null ? "—" : avg.toFixed(1);
}

export default async function MetricsPage() {
  const user = await getCurrentUser();
  const today = todayKey();
  const weekStarts = lastNWeekStarts(today, METRICS_WINDOW_WEEKS);

  const data = await getMetricsData(user.id, weekStarts);
  const hasNoData = data.checkins.length === 0 && data.reflections.length === 0;

  // Decision 1 (T2 spec): "active week" here is deliberately stricter than
  // lib/db/queries/streaks.ts's collectActiveWeeks — only a saved check-in
  // or a saved reflection counts, not contributions or checklist steps. This
  // instrument measures whether the methodology cycle (check in / reflect)
  // ran, not general app activity. Do NOT unify this with streaks.ts's
  // definition — that would silently change what the instrument measures.
  const activeWeekStarts = new Set<string>();
  for (const c of data.checkins) activeWeekStarts.add(weekStartKey(c.date));
  for (const r of data.reflections) activeWeekStarts.add(r.weekStart);
  const activeList = [...activeWeekStarts];

  const cycles = completedCycles(data.reflections);
  const promiseMix = promiseOutcomeMix(data.reflections);
  const coverage = checkinCoverage(data.checkins, weekStarts, today);
  const feeling = feelingByOutcome(data.checkins);
  const gaps = gapsAndReturns(activeList, weekStarts);
  const rhythmSummary = returnRhythmSummary(returnRhythm(activeList, weekStarts));
  const consistency = rollingConsistency(activeList, weekStarts);
  const ifThen = ifThenCoverage(data.checklistItems);
  const orphans = orphanPromises(data.reflections);
  const adjustmentMix = planAdjustmentMix(data.planAdjustments);

  const closedByWeek = new Map(cycles.weeks.map((w) => [w.weekStart, w.completed]));
  const coverageByWeek = new Map(coverage.map((c) => [c.weekStart, c]));
  const returnGapByWeek = new Map(gaps.returns.map((r) => [r.weekStart, r.gapWeeks]));
  const missedSet = new Set(gaps.missed);

  const totalCoverageDays = coverage.reduce((sum, c) => sum + c.daysWithCheckin, 0);
  const totalCoverageWindow = coverage.reduce((sum, c) => sum + c.daysInWeek, 0);
  const totalCoverageRatio = totalCoverageWindow === 0 ? 0 : totalCoverageDays / totalCoverageWindow;

  const lowData = !hasNoData && activeWeekStarts.size < MIN_WEEKS_FOR_SIGNAL;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Приборы</h1>
        <p className="text-sm text-muted-foreground">
          Числа за последние {METRICS_WINDOW_WEEKS} недель — то, что реально записано в чек-инах и
          рефлексиях, без графиков и оценок.
        </p>
      </div>

      {hasNoData ? (
        <EmptyState
          title="Данных пока нет"
          description="За это окно не сохранено ни одного чек-ина и ни одной рефлексии. Приборы заполнятся, когда появятся первые записи."
        />
      ) : (
        <>
          {lowData ? (
            <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm font-medium text-foreground">
              Данных мало — активность отмечена меньше, чем в {MIN_WEEKS_FOR_SIGNAL} неделях. Числа
              ниже ничего не доказывают.
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/8">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Неделя</th>
                  <th className="px-3 py-2 font-medium">Цикл закрыт</th>
                  <th className="px-3 py-2 font-medium">Чек-ины</th>
                  <th className="px-3 py-2 font-medium">Сделал / частично / не сегодня</th>
                  <th className="px-3 py-2 font-medium">Пропуск / возврат</th>
                </tr>
              </thead>
              <tbody>
                {weekStarts.map((weekStart) => {
                  const weekCheckins = data.checkins.filter((c) => weekStartKey(c.date) === weekStart);
                  const mix = checkinOutcomeMix(weekCheckins);
                  const cov = coverageByWeek.get(weekStart);
                  const gapCell = gapCellLabel({
                    missed: missedSet.has(weekStart),
                    returnGapWeeks: returnGapByWeek.get(weekStart),
                  });

                  return (
                    <tr key={weekStart} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(parseISO(weekStart), "d MMM", { locale: ru })}
                      </td>
                      <td className="px-3 py-2">{closedByWeek.get(weekStart) ? "да" : "нет"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {cov ? `${cov.daysWithCheckin}/${cov.daysInWeek} · ${pct(cov.ratio)}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {mix.done} / {mix.partial} / {mix.skipped}
                      </td>
                      <td className="px-3 py-2">{gapCell}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Сводка за период</CardTitle>
              <CardDescription>{METRICS_WINDOW_WEEKS} недель, включая текущую</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Закрытых циклов: {cycles.completed} из {cycles.total}
                </span>
                <span className="text-xs text-muted-foreground">
                  Цикл закрыт, когда в рефлексии проставлен исход обещания — любой из трёх, включая
                  честное «не в этот раз».
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">Исходы обещаний</span>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {OUTCOME_LABELS.done}: {promiseMix.done}
                  </Badge>
                  <Badge variant="secondary">
                    {OUTCOME_LABELS.partial}: {promiseMix.partial}
                  </Badge>
                  <Badge variant="secondary">
                    {OUTCOME_LABELS.skipped}: {promiseMix.skipped}
                  </Badge>
                  <Badge variant="secondary">Не проставлено: {promiseMix.unset}</Badge>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">Состояние по исходу дня</span>
                <div className="flex flex-wrap gap-2">
                  {OUTCOMES.map((outcome) => (
                    <Badge key={outcome} variant="secondary">
                      {OUTCOME_LABELS[outcome]}: {avgLabel(feeling[outcome].avg)} (n={feeling[outcome].n})
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Покрытие чек-инами за период: {totalCoverageDays}/{totalCoverageWindow} дней (
                  {pct(totalCoverageRatio)})
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Покрытие «если—то»: {ifThen.structured} из {ifThen.total} ({pct(ifThen.ratio)})
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Осиротевшие обещания: {orphans.orphans} из {orphans.totalWithPromise}
                </span>
                <span className="text-xs text-muted-foreground">
                  Обещание без привязанной цели — из тех недель, где обещание вообще было
                  сформулировано.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  Активность: {consistency.active} из последних {consistency.window} недель
                </span>
              </div>

              {/* B5: возврат после пропуска — отдельное событие, а не дыра в
                  счётчике. Строка нейтральная: ни похвалы за возврат, ни укора
                  за пропуск — оба числа стоят рядом как факты. Признак №5
                  правила решения (DECISION-RULE.md §4) читается отсюда и из
                  того же набора чисел в замороженном срезе. */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{rhythmSummary.headline}</span>
                <span className="text-xs text-muted-foreground">{rhythmSummary.hint}</span>
              </div>

              <div className="flex flex-col gap-1">
                {adjustmentMix.total === 0 ? (
                  <span className="text-sm font-medium text-foreground">Поправок плана за период не было.</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground">
                      Поправки плана: {adjustmentMix.total}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      оставить — {adjustmentMix.keep} · меньше — {adjustmentMix.smaller} · триггер —{" "}
                      {adjustmentMix.change_trigger} · план на случай — {adjustmentMix.add_coping_plan} · пауза —{" "}
                      {adjustmentMix.pause_goal} · закрыть — {adjustmentMix.drop_goal}
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
