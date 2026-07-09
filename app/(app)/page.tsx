import { getCurrentUser } from "@/lib/auth";
import { getDashboardAggregates, listGoals, type ListGoalsOptions } from "@/lib/db/queries/goals";
import { calcFinancialProgress, formatMoney } from "@/lib/utils/money";
import type { Currency } from "@/lib/validators/goal";
import { EmptyState } from "@/components/goals/empty-state";
import { GoalCard } from "@/components/goals/goal-card";
import {
  DashboardControls,
  type GoalKindFilter,
  type GoalStatusFilter,
  type SortOption,
} from "@/components/goals/dashboard-controls";
import { Progress } from "@/components/ui/progress";

const STATUS_VALUES: GoalStatusFilter[] = ["active", "achieved", "archived"];
const KIND_VALUES: GoalKindFilter[] = ["financial", "non_financial"];
const CURRENCY_VALUES: Currency[] = ["RUB", "USD"];
const SORT_VALUES: SortOption[] = ["deadline", "percent", "created"];

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const user = await getCurrentUser();

  const sp = await searchParams;
  const status = parseEnum(sp.status, STATUS_VALUES) ?? "active";
  const kind = parseEnum(sp.kind, KIND_VALUES);
  const currency = parseEnum(sp.currency, CURRENCY_VALUES);
  const sort = parseEnum(sp.sort, SORT_VALUES) ?? "deadline";

  const filterOpts: ListGoalsOptions = { status, kind, currency, sort };

  const [allGoals, goals, aggregates] = await Promise.all([
    listGoals(user.id, {}),
    listGoals(user.id, filterOpts),
    getDashboardAggregates(user.id),
  ]);

  const counts: Record<GoalStatusFilter, number> = {
    active: allGoals.filter((g) => g.status === "active").length,
    achieved: allGoals.filter((g) => g.status === "achieved").length,
    archived: allGoals.filter((g) => g.status === "archived").length,
  };

  const greetingName = user.name?.trim() || user.email.split("@")[0];

  const rubTarget = aggregates.byCurrency.RUB.target;
  const usdTarget = aggregates.byCurrency.USD.target;
  const stepsPercent =
    aggregates.totalItems > 0 ? Math.round((aggregates.doneItems / aggregates.totalItems) * 100) : 0;

  const emptyCopy = EMPTY_COPY[status];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Привет, {greetingName} 👋</p>
        <h1 className="font-display text-[44px] leading-tight font-bold tracking-tight">
          Вперёд к целям
        </h1>
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
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} isFocus={goal.id === user.focusGoalId} />
          ))}
        </div>
      )}
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
