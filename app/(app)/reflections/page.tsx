import { addDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { getCurrentUser } from "@/lib/auth";
import { getFocusGoal } from "@/lib/db/queries/agenda";
import { listChecklistItems } from "@/lib/db/queries/checklist";
import { listGoals } from "@/lib/db/queries/goals";
import {
  countCompletedCycles,
  getLatestReflectionBefore,
  getReflectionByWeek,
  listReflections,
} from "@/lib/db/queries/reflections";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { parsePrevOutcomeParam, WEEK_OUTCOME_LABELS } from "@/lib/utils/promise-card";
import { toAdjustmentStepOptions } from "@/lib/utils/adjustment-step";
import { Badge } from "@/components/ui/badge";
import { ReflectionForm } from "@/app/(app)/reflections/reflection-form";

// Reuses check-in wording, except "не в этот раз" replaces "не сегодня" — a
// promise's fate over a week, not a single day (Decisions). The strings
// themselves live in lib/utils/promise-card.ts, shared with /today's card.
const PREV_OUTCOME_LABELS: Record<string, string> = WEEK_OUTCOME_LABELS;

export default async function ReflectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ prevOutcome?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  const weekStart = weekStartKey(todayKey());
  const weekEnd = addDays(parseISO(weekStart), 6);
  const preselectedPrevOutcome = parsePrevOutcomeParam((await searchParams).prevOutcome);

  const [current, prev, history, cycles, activeGoals, focusGoal] = await Promise.all([
    getReflectionByWeek(user.id, weekStart),
    getLatestReflectionBefore(user.id, weekStart),
    listReflections(user.id, 12),
    countCompletedCycles(user.id),
    listGoals(user.id, { status: "active" }),
    getFocusGoal(user.id),
  ]);

  // Decisions D6: the focus goal (Цель №1) if set, else the first active goal
  // in the app's own default ordering (listGoals' default sort — deadline).
  const defaultGoalId = focusGoal?.id ?? activeGoals[0]?.id ?? null;

  // T14 (PLAN §5 B4): the previous promise's goal, from the SAME object
  // `prevPromise` already reads — null is a legitimate "orphan promise"
  // (Decisions D2), not an error, so the checklist is only fetched when a
  // goal is actually there to attach the plan-adjustment node to.
  const prevPromiseGoalId = prev?.promiseGoalId ?? null;
  const prevGoalChecklistItems = prevPromiseGoalId
    ? await listChecklistItems(user.id, prevPromiseGoalId)
    : [];

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

      {/* expectedWeekStart pins the form to the week it was rendered for, so a
          submit that lands after the week boundary is refused instead of being
          filed under the next week (CR-030). */}
      <ReflectionForm
        current={current}
        prevPromise={prev?.promise ?? null}
        expectedWeekStart={weekStart}
        activeGoals={activeGoals.map((goal) => ({ id: goal.id, title: goal.title }))}
        defaultGoalId={defaultGoalId}
        preselectedPrevOutcome={preselectedPrevOutcome}
        prevPromiseGoalId={prevPromiseGoalId}
        prevGoalSteps={prevPromiseGoalId ? toAdjustmentStepOptions(prevGoalChecklistItems) : []}
      />

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
