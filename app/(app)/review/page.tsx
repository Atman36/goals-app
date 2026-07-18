import Link from "next/link";
import { AlertTriangle, Minus, TrendingUp } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getWeeklyReviewData } from "@/lib/db/queries/agenda";
import { bucketGoals, type GoalActivity } from "@/lib/utils/weekly-review";
import { buildBalanceWheel } from "@/lib/utils/balance-wheel";
import { BalanceWheel } from "@/components/review/balance-wheel";
import { todayKey, daysBetweenKeys } from "@/lib/utils/date-keys";
import { pluralRu } from "@/lib/utils/plural";
import { EmptyState } from "@/components/goals/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function progressedLine(goal: GoalActivity): string {
  const c = goal.contributionsInWindow;
  const s = goal.stepsDoneInWindow;
  const ci = goal.checkinsInWindow;
  if (c === 0 && s === 0 && ci === 0) return "Есть активность на этой неделе";
  const parts = [
    `${c} ${pluralRu(c, "пополнение", "пополнения", "пополнений")}`,
    `${s} ${pluralRu(s, "шаг", "шага", "шагов")}`,
  ];
  if (ci > 0) parts.push(`${ci} ${pluralRu(ci, "чек-ин", "чек-ина", "чек-инов")}`);
  return `${parts.join(" · ")} за неделю`;
}

function stalledLine(goal: GoalActivity, today: string): string {
  if (!goal.lastActivityKey) return "Ещё не было активности";
  const d = daysBetweenKeys(goal.lastActivityKey, today);
  return `Без активности ${d} ${pluralRu(d, "день", "дня", "дней")}`;
}

function steadyLine(goal: GoalActivity, today: string): string {
  if (!goal.lastActivityKey) return "Пока без активности";
  const d = daysBetweenKeys(goal.lastActivityKey, today);
  return `Последняя активность ${d} ${pluralRu(d, "день", "дня", "дней")} назад`;
}

function ReviewRow({ goal, line }: { goal: GoalActivity; line: string }) {
  return (
    <Link
      href={`/goals/${goal.goalId}`}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="text-sm font-medium text-foreground">{goal.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{line}</span>
    </Link>
  );
}

export default async function WeeklyReviewPage() {
  const user = await getCurrentUser();
  const data = await getWeeklyReviewData(user.id);
  const today = todayKey();
  const { progressed, stalled, steady } = bucketGoals(data, today);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Обзор недели</h1>
        <p className="text-sm text-muted-foreground">
          Что продвинулось и что застряло за последнюю неделю
        </p>
        <Link href="/reflections" className="text-sm font-semibold text-primary hover:underline">
          Пройти рефлексию недели →
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="Пока нет активных целей"
          description="Создайте цель, чтобы начать отслеживать прогресс."
          actionHref="/goals/new"
          actionLabel="+ Новая цель"
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-positive" />
                <CardTitle>Продвинулось</CardTitle>
                <Badge variant="secondary" className="bg-positive/12 text-positive">
                  {progressed.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {progressed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  На этой неделе пока нет продвижения — самое время сделать шаг.
                </p>
              ) : (
                progressed.map((g) => <ReviewRow key={g.goalId} goal={g} line={progressedLine(g)} />)
              )}
            </CardContent>
          </Card>

          {stalled.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warn" />
                  <CardTitle>Застряло</CardTitle>
                  <Badge variant="secondary" className="bg-warn/12 text-warn">
                    {stalled.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {stalled.map((g) => (
                  <ReviewRow key={g.goalId} goal={g} line={stalledLine(g, today)} />
                ))}
              </CardContent>
            </Card>
          ) : null}

          {steady.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Minus className="size-4 text-muted-foreground" />
                  <CardTitle>Идёт ровно</CardTitle>
                  <Badge variant="secondary">{steady.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {steady.map((g) => (
                  <ReviewRow key={g.goalId} goal={g} line={steadyLine(g, today)} />
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Колесо баланса</CardTitle>
              <CardDescription>Куда уходит внимание по сферам жизни</CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceWheel data={buildBalanceWheel(data)} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
