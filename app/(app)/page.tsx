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
            label="₽"
            value={`накоплено ${formatMoney(aggregates.byCurrency.RUB.saved, "RUB")} из ${formatMoney(rubTarget, "RUB")}`}
            percent={Math.round(calcFinancialProgress(aggregates.byCurrency.RUB.saved, rubTarget) * 100)}
          />
        ) : null}
        {usdTarget > 0n ? (
          <StatCard
            label="$"
            value={`накоплено ${formatMoney(aggregates.byCurrency.USD.saved, "USD")} из ${formatMoney(usdTarget, "USD")}`}
            percent={Math.round(calcFinancialProgress(aggregates.byCurrency.USD.saved, usdTarget) * 100)}
          />
        ) : null}
        <StatCard
          label="шаги"
          value={`${aggregates.doneItems} из ${aggregates.totalItems}`}
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
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-card p-4 ring-1 ring-foreground/8">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display text-lg font-bold">{value}</span>
      <Progress value={percent} aria-label={label} />
    </div>
  );
}
