"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ListGoalsOptions } from "@/lib/db/queries/goals";
import type { Currency } from "@/lib/validators/goal";

export type GoalStatusFilter = NonNullable<ListGoalsOptions["status"]>;
export type GoalKindFilter = NonNullable<ListGoalsOptions["kind"]>;
export type SortOption = NonNullable<ListGoalsOptions["sort"]>;

const STATUS_TABS: { value: GoalStatusFilter; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "achieved", label: "Достигнутые" },
  { value: "archived", label: "Архив" },
];

interface Navigation {
  status?: GoalStatusFilter;
  kind?: GoalKindFilter;
  currency?: Currency;
  sort?: SortOption;
}

export function DashboardControls({
  status,
  kind,
  currency,
  sort,
  counts,
}: {
  status: GoalStatusFilter;
  kind: GoalKindFilter | undefined;
  currency: Currency | undefined;
  sort: SortOption;
  counts: Record<GoalStatusFilter, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(next: Navigation) {
    const merged = {
      status: next.status ?? status,
      kind: "kind" in next ? next.kind : kind,
      currency: "currency" in next ? next.currency : currency,
      sort: next.sort ?? sort,
    };
    const params = new URLSearchParams();
    params.set("status", merged.status);
    if (merged.kind) params.set("kind", merged.kind);
    if (merged.currency) params.set("currency", merged.currency);
    params.set("sort", merged.sort);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => navigate({ status: tab.value })}
              className={cn(
                "rounded-4xl px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label} <span className="tabular-nums opacity-70">{counts[tab.value]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Вид цели"
          value={kind ?? ""}
          onChange={(e) =>
            navigate({ kind: (e.target.value || undefined) as GoalKindFilter | undefined })
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Все виды</option>
          <option value="financial">Финансовые</option>
          <option value="non_financial">Нефинансовые</option>
        </select>

        <select
          aria-label="Валюта"
          value={currency ?? ""}
          onChange={(e) =>
            navigate({ currency: (e.target.value || undefined) as Currency | undefined })
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Все валюты</option>
          <option value="RUB">₽</option>
          <option value="USD">$</option>
        </select>

        <select
          aria-label="Сортировка"
          value={sort}
          onChange={(e) => navigate({ sort: e.target.value as SortOption })}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="deadline">по дедлайну ↓</option>
          <option value="percent">по проценту</option>
          <option value="created">по дате создания</option>
        </select>
      </div>
    </div>
  );
}
