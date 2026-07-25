import Link from "next/link";
import { CalendarClock, ListChecks, Star } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import {
  getFocusGoal,
  listGoalsByDeadline,
  listOverdueAndUpcomingSteps,
  type ChecklistStepDue,
  type GoalDeadline,
} from "@/lib/db/queries/agenda";
import { getGlobalConsistency } from "@/lib/db/queries/streaks";
import { getCheckinForGoalOnDate } from "@/lib/db/queries/checkins";
import { getLatestReflectionBefore, getReflectionByWeek } from "@/lib/db/queries/reflections";
import { listChecklistItems } from "@/lib/db/queries/checklist";
import { getRecentPlanAdjustmentForGoal } from "@/lib/db/queries/plan-adjustments";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { promiseCardState } from "@/lib/utils/promise-card";
import { consistencyBadgeState } from "@/lib/utils/consistency-badge";
import { toAdjustmentStepOptions } from "@/lib/utils/adjustment-step";
import { classifyDue, formatDueLabelRu, type DueBucket } from "@/lib/utils/reminders";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/goals/empty-state";
import { GoalCard } from "@/components/goals/goal-card";
import { CheckinCard } from "@/components/goals/checkin-card";
import { ConsistencyBadge } from "@/components/goals/consistency-badge";
import { WeeklyPromiseCard } from "@/components/goals/weekly-promise-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const BUCKET_STYLE: Record<DueBucket, string> = {
  overdue: "bg-negative/12 text-negative",
  today: "bg-primary/12 text-primary",
  soon: "bg-warn/12 text-warn",
  later: "bg-muted text-muted-foreground",
};

function groupSteps(steps: ChecklistStepDue[], today: string) {
  const overdue: ChecklistStepDue[] = [];
  const dueToday: ChecklistStepDue[] = [];
  const soon: ChecklistStepDue[] = [];
  for (const step of steps) {
    const bucket = classifyDue(step.dueDate, today, 7);
    if (bucket === "overdue") overdue.push(step);
    else if (bucket === "today") dueToday.push(step);
    else if (bucket === "soon") soon.push(step);
  }
  return { overdue, dueToday, soon };
}

function groupDeadlines(deadlines: GoalDeadline[], today: string) {
  const overdue: GoalDeadline[] = [];
  const dueToday: GoalDeadline[] = [];
  const soon: GoalDeadline[] = [];
  for (const goal of deadlines) {
    const bucket = classifyDue(goal.deadline, today, 14);
    if (bucket === "overdue") overdue.push(goal);
    else if (bucket === "today") dueToday.push(goal);
    else if (bucket === "soon" || bucket === "later") soon.push(goal);
  }
  return { overdue, dueToday, soon };
}

function StepRow({ step, today }: { step: ChecklistStepDue; today: string }) {
  const bucket = classifyDue(step.dueDate, today, 7) ?? "later";
  return (
    <Link
      href={`/goals/${step.goalId}`}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-muted-foreground">{step.goalTitle}</span>
        <span className="truncate text-sm font-medium text-foreground">{step.title}</span>
      </span>
      <Badge variant="secondary" className={cn("shrink-0", BUCKET_STYLE[bucket])}>
        {formatDueLabelRu(step.dueDate, today)}
      </Badge>
    </Link>
  );
}

function DeadlineRow({ goal, today }: { goal: GoalDeadline; today: string }) {
  const bucket = classifyDue(goal.deadline, today, 14) ?? "later";
  return (
    <Link
      href={`/goals/${goal.goalId}`}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="truncate text-sm font-medium text-foreground">{goal.title}</span>
      <Badge variant="secondary" className={cn("shrink-0", BUCKET_STYLE[bucket])}>
        {formatDueLabelRu(goal.deadline, today)}
      </Badge>
    </Link>
  );
}

export default async function TodayPage() {
  const user = await getCurrentUser();
  const today = todayKey();
  const weekStart = weekStartKey(today);

  const [focusGoal, steps, deadlines, consistency, currentReflection, previousReflection] =
    await Promise.all([
      getFocusGoal(user.id),
      listOverdueAndUpcomingSteps(user.id, 7),
      listGoalsByDeadline(user.id, 14),
      getGlobalConsistency(user.id),
      getReflectionByWeek(user.id, weekStart),
      getLatestReflectionBefore(user.id, weekStart),
    ]);
  const checkin = focusGoal ? await getCheckinForGoalOnDate(user.id, focusGoal.id, today) : null;
  const [checklistItems, recentAdjustment] = focusGoal
    ? await Promise.all([
        listChecklistItems(user.id, focusGoal.id),
        getRecentPlanAdjustmentForGoal(user.id, focusGoal.id),
      ])
    : [[], null];

  const stepGroups = groupSteps(steps, today);
  const deadlineGroups = groupDeadlines(deadlines, today);
  const badge = consistencyBadgeState(consistency);

  // T6 (PLAN §5 B2): the weekly promise lives here every day, not only on
  // /reflections. `unclosed-previous` is rendered above everything — including
  // above the empty state, because the invitation to close a cycle must not
  // disappear exactly when the person is least engaged (Decisions #6).
  const promiseStates = promiseCardState({
    currentWeek: currentReflection
      ? {
          promise: currentReflection.promise,
          prevOutcome: currentReflection.prevOutcome,
          goal: currentReflection.promiseGoal,
        }
      : null,
    previousWeek: previousReflection
      ? {
          promise: previousReflection.promise,
          goal: previousReflection.promiseGoal,
          weekStart: previousReflection.weekStart,
        }
      : null,
    todayKey: today,
  });
  const unclosedPrevious = promiseStates.filter((s) => s.kind === "unclosed-previous");
  const currentPromise = promiseStates.filter((s) => s.kind !== "unclosed-previous");

  const isEmpty = !focusGoal && steps.length === 0 && deadlines.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Сегодня</h1>
        <p className="text-sm text-muted-foreground">Что сделать сегодня по всем активным целям</p>
        <ConsistencyBadge state={badge} className="mt-2 self-start" />
        {/* T8 Decisions #5: the return after a gap gets its own neutral line
            — no fire, no counter, no exclamation mark — and only here. */}
        {badge.returnNote ? (
          <p className="mt-2 text-sm text-muted-foreground">{badge.returnNote}</p>
        ) : null}
      </div>

      {/* Both blocks sit outside the isEmpty branch: a promise can exist while
          the day itself is empty (its goal may have no deadline and not be the
          focus goal), and that is precisely the day it must not vanish. */}
      {unclosedPrevious.map((state, i) => (
        <WeeklyPromiseCard key={`unclosed-${i}`} state={state} />
      ))}
      {currentPromise.map((state, i) => (
        <WeeklyPromiseCard key={`promise-${i}`} state={state} />
      ))}

      {isEmpty ? (
        <EmptyState title="На сегодня всё чисто ✨" description="Активных дел по целям нет." actionHref="/" actionLabel="К целям" />
      ) : (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
              <Star className="size-4 text-primary" /> Цель №1
            </h2>
            {focusGoal ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <GoalCard goal={focusGoal} isFocus />
                </div>
                {/* Keyed by the day. A check-in submitted after midnight is
                    rejected as stale (GA-013) and the card offers a refresh;
                    router.refresh() keeps client state, so without this key the
                    new day's card would still hold yesterday's answers and would
                    save them under today the moment the user touched a control. */}
                <CheckinCard
                  key={today}
                  goalId={focusGoal.id}
                  expectedDate={today}
                  initial={
                    checkin
                      ? { outcome: checkin.outcome, feeling: checkin.feeling, note: checkin.note }
                      : null
                  }
                  steps={toAdjustmentStepOptions(checklistItems)}
                  lastAdjustmentAt={recentAdjustment?.createdAt ?? null}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-start gap-2 pt-(--card-spacing)">
                  <p className="text-sm text-muted-foreground">
                    Отметьте главную цель как №1 на её странице
                  </p>
                  <Link href="/" className="text-sm font-semibold text-primary hover:underline">
                    К целям
                  </Link>
                </CardContent>
              </Card>
            )}
          </section>

          {steps.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
                <ListChecks className="size-4 text-muted-foreground" /> Шаги
              </h2>
              <div className="flex flex-col gap-4">
                {stepGroups.overdue.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-negative">Просрочено</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {stepGroups.overdue.map((step) => (
                        <StepRow key={step.itemId} step={step} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
                {stepGroups.dueToday.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-primary">Сегодня</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {stepGroups.dueToday.map((step) => (
                        <StepRow key={step.itemId} step={step} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
                {stepGroups.soon.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>На этой неделе</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {stepGroups.soon.map((step) => (
                        <StepRow key={step.itemId} step={step} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </section>
          ) : null}

          {deadlines.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
                <CalendarClock className="size-4 text-muted-foreground" /> Дедлайны целей
              </h2>
              <div className="flex flex-col gap-4">
                {deadlineGroups.overdue.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-negative">Просроченные дедлайны</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {deadlineGroups.overdue.map((goal) => (
                        <DeadlineRow key={goal.goalId} goal={goal} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
                {deadlineGroups.dueToday.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-primary">Сегодня</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {deadlineGroups.dueToday.map((goal) => (
                        <DeadlineRow key={goal.goalId} goal={goal} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
                {deadlineGroups.soon.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Скоро</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {deadlineGroups.soon.map((goal) => (
                        <DeadlineRow key={goal.goalId} goal={goal} today={today} />
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
