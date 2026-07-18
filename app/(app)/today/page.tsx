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
import { getGlobalStreak } from "@/lib/db/queries/streaks";
import { getCheckinForGoalOnDate } from "@/lib/db/queries/checkins";
import { todayKey } from "@/lib/utils/date-keys";
import { classifyDue, formatDueLabelRu, type DueBucket } from "@/lib/utils/reminders";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/goals/empty-state";
import { GoalCard } from "@/components/goals/goal-card";
import { CheckinCard } from "@/components/goals/checkin-card";
import { StreakBadge } from "@/components/goals/streak-badge";
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

  const [focusGoal, steps, deadlines, streak] = await Promise.all([
    getFocusGoal(user.id),
    listOverdueAndUpcomingSteps(user.id, 7),
    listGoalsByDeadline(user.id, 14),
    getGlobalStreak(user.id),
  ]);
  const checkin = focusGoal ? await getCheckinForGoalOnDate(user.id, focusGoal.id, today) : null;

  const stepGroups = groupSteps(steps, today);
  const deadlineGroups = groupDeadlines(deadlines, today);

  const isEmpty = !focusGoal && steps.length === 0 && deadlines.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Сегодня</h1>
        <p className="text-sm text-muted-foreground">Что сделать сегодня по всем активным целям</p>
        <StreakBadge weeks={streak} className="mt-2 self-start" />
      </div>

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
                <CheckinCard
                  goalId={focusGoal.id}
                  initial={
                    checkin
                      ? { outcome: checkin.outcome, feeling: checkin.feeling, note: checkin.note }
                      : null
                  }
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
