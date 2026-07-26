import Link from "next/link";
import { CalendarClock, ListChecks } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getDashboardAggregates, listGoals, type ListGoalsOptions } from "@/lib/db/queries/goals";
import {
  listGoalsByDeadline,
  listOverdueAndUpcomingSteps,
  type ChecklistStepDue,
  type GoalDeadline,
} from "@/lib/db/queries/agenda";
import { todayKey } from "@/lib/utils/date-keys";
import { classifyDue, formatDueLabelRu, type DueBucket } from "@/lib/utils/reminders";
import { calcFinancialProgress, formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/validators/goal";
import { EmptyState } from "@/components/goals/empty-state";
import { GoalCard } from "@/components/goals/goal-card";
import {
  DashboardControls,
  type GoalKindFilter,
  type GoalStatusFilter,
  type SortOption,
} from "@/components/goals/dashboard-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// The goal list, its tiles, tabs and filters — moved here verbatim from the
// home route when the home page became the daily loop. DashboardControls needed
// no edit: it builds its URLs from usePathname().
//
// «Шаги» and «Дедлайны» came with it from /today (C5). They are the largest
// thing the redesign would otherwise have dropped in silence: the new home
// answers «что сегодня по цели №1», and these two answer «что вообще на
// подходе» across every goal. Different question, so a different page — but not
// no page. The queries behind them are unchanged; only the markup moved.

const STATUS_VALUES: GoalStatusFilter[] = ["active", "achieved", "archived"];
const KIND_VALUES: GoalKindFilter[] = ["financial", "non_financial"];
const CURRENCY_VALUES: Currency[] = ["RUB", "USD"];
const SORT_VALUES: SortOption[] = ["deadline", "percent", "created"];

const BUCKET_STYLE: Record<DueBucket, string> = {
  overdue: "bg-negative/12 text-negative",
  today: "bg-primary/12 text-primary",
  soon: "bg-warn/12 text-warn",
  later: "bg-muted text-muted-foreground",
};

function parseEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const EMPTY_COPY: Record<GoalStatusFilter, { title: string; description: string }> = {
  active: {
    title: "Пока нет ни одной активной цели",
    description:
      "Создайте первую цель — с картинкой, суммой (или чек-листом) и сроком, — чтобы начать путь к результату.",
  },
  achieved: {
    title: "Пока нет достигнутых целей",
    description: "Как только вы отметите цель достигнутой, она появится здесь.",
  },
  archived: {
    title: "В архиве пока пусто",
    description: "Сюда попадают цели, которые вы решили отложить или больше не преследовать.",
  },
};

interface DashboardSearchParams {
  status?: string;
  kind?: string;
  currency?: string;
  sort?: string;
}

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

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const user = await getCurrentUser();
  const today = todayKey();

  const sp = await searchParams;
  const status = parseEnum(sp.status, STATUS_VALUES) ?? "active";
  const kind = parseEnum(sp.kind, KIND_VALUES);
  const currency = parseEnum(sp.currency, CURRENCY_VALUES);
  const sort = parseEnum(sp.sort, SORT_VALUES) ?? "deadline";

  const filterOpts: ListGoalsOptions = { status, kind, currency, sort };

  const [allGoals, goals, aggregates, steps, deadlines] = await Promise.all([
    listGoals(user.id, {}),
    listGoals(user.id, filterOpts),
    getDashboardAggregates(user.id),
    listOverdueAndUpcomingSteps(user.id, 7),
    listGoalsByDeadline(user.id, 14),
  ]);

  const counts: Record<GoalStatusFilter, number> = {
    active: allGoals.filter((g) => g.status === "active").length,
    achieved: allGoals.filter((g) => g.status === "achieved").length,
    archived: allGoals.filter((g) => g.status === "archived").length,
  };

  const rubTarget = aggregates.byCurrency.RUB.target;
  const usdTarget = aggregates.byCurrency.USD.target;
  const stepsPercent =
    aggregates.totalItems > 0 ? Math.round((aggregates.doneItems / aggregates.totalItems) * 100) : 0;

  const stepGroups = groupSteps(steps, today);
  const deadlineGroups = groupDeadlines(deadlines, today);

  const emptyCopy = EMPTY_COPY[status];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Все цели, архив и то, что на подходе</p>
        <h1 className="font-display text-[44px] leading-tight font-bold tracking-tight">Цели</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {rubTarget > 0n ? (
          <StatCard
            label="Накоплено · ₽"
            hero={formatMoney(aggregates.byCurrency.RUB.saved, "RUB")}
            sub={`из ${formatMoney(rubTarget, "RUB")}`}
            percent={Math.round(calcFinancialProgress(aggregates.byCurrency.RUB.saved, rubTarget) * 100)}
          />
        ) : null}
        {usdTarget > 0n ? (
          <StatCard
            label="Накоплено · $"
            hero={formatMoney(aggregates.byCurrency.USD.saved, "USD")}
            sub={`из ${formatMoney(usdTarget, "USD")}`}
            percent={Math.round(calcFinancialProgress(aggregates.byCurrency.USD.saved, usdTarget) * 100)}
          />
        ) : null}
        <StatCard
          label="Шаги · нефинансовые"
          hero={`${aggregates.doneItems} из ${aggregates.totalItems}`}
          sub="пройдено шагов"
          percent={stepsPercent}
        />
      </div>

      <DashboardControls
        status={status}
        kind={kind}
        currency={currency}
        sort={sort}
        counts={counts}
      />

      {goals.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionHref={status === "active" ? "/goals/new" : undefined}
          actionLabel={status === "active" ? "+ Новая цель" : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* `goal.status === "active"` matches getFocusGoal's own filter — the
              raw focus_goal_id column can still point at a goal that has since
              been archived or achieved, which would light up the badge for a
              goal the home page no longer treats as the focus. */}
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              isFocus={goal.id === user.focusGoalId && goal.status === "active"}
            />
          ))}
        </div>
      )}

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
  );
}

function StatCard({
  label,
  hero,
  sub,
  percent,
}: {
  label: string;
  hero: string;
  sub: string;
  percent: number;
}) {
  return (
    <div className="flex flex-col rounded-[20px] bg-card p-5 ring-1 ring-foreground/8">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="mt-2 font-display text-[26px] leading-none font-bold tracking-tight">{hero}</span>
      <span className="mt-1 text-xs text-muted-foreground">{sub}</span>
      <Progress value={percent} aria-label={label} className="mt-3" />
    </div>
  );
}
