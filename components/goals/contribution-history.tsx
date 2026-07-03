"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils/money";
import type { Contribution } from "@/lib/db/schema";
import type { Currency } from "@/lib/validators/goal";

/** JSON-safe client-side shape (amount as bigint, parsed back from the
 *  API's string) — shared by ContributionHistory and quick-add-sheet.tsx's
 *  FinancialProgressHeader/QuickAddSheet via the same query key, which is
 *  how a quick-add optimistic update shows up in the ring without prop
 *  drilling (TanStack Query cache is the single source of truth here). */
export interface ClientContribution {
  id: string;
  amount: bigint;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export function contributionsQueryKey(goalId: string) {
  return ["contributions", goalId] as const;
}

function toClientContribution(row: Contribution): ClientContribution {
  return {
    id: row.id,
    amount: row.amount,
    note: row.note,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Mirrors listContributions' ORDER BY occurred_at DESC, created_at DESC —
 *  ISO date/timestamp strings sort lexicographically the same as
 *  chronologically, so plain string comparison is enough. */
function sortContributions(list: ClientContribution[]): ClientContribution[] {
  return [...list].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

interface ContributionsResponse {
  data: { id: string; amount: string; note: string | null; occurredAt: string; createdAt: string }[];
}

async function fetchContributions(goalId: string): Promise<ClientContribution[]> {
  const res = await fetch(`/api/v1/goals/${goalId}/contributions`);
  if (!res.ok) throw new Error("Не удалось загрузить историю");
  const json = (await res.json()) as ContributionsResponse;
  return sortContributions(
    json.data.map((row) => ({
      id: row.id,
      amount: BigInt(row.amount),
      note: row.note,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    })),
  );
}

export function useContributionsQuery(goalId: string, initialContributions: Contribution[]) {
  return useQuery({
    queryKey: contributionsQueryKey(goalId),
    queryFn: () => fetchContributions(goalId),
    initialData: () => sortContributions(initialContributions.map(toClientContribution)),
    // The server component already fetched fresh data for this render — skip
    // the otherwise-automatic refetch-on-mount; mutations still force a
    // refetch via invalidateQueries regardless of staleTime.
    staleTime: 30_000,
  });
}

export function ContributionHistory({
  goalId,
  currency,
  initialContributions,
}: {
  goalId: string;
  currency: Currency;
  initialContributions: Contribution[];
}) {
  const queryClient = useQueryClient();
  const { data: contributions } = useContributionsQuery(goalId, initialContributions);

  const deleteMutation = useMutation({
    mutationFn: async (contributionId: string) => {
      const res = await fetch(`/api/v1/contributions/${contributionId}?goalId=${goalId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Не удалось удалить взнос");
      return res.json();
    },
    onMutate: async (contributionId: string) => {
      await queryClient.cancelQueries({ queryKey: contributionsQueryKey(goalId) });
      const previous = queryClient.getQueryData<ClientContribution[]>(contributionsQueryKey(goalId));
      queryClient.setQueryData<ClientContribution[]>(contributionsQueryKey(goalId), (old) =>
        (old ?? []).filter((c) => c.id !== contributionId),
      );
      return { previous };
    },
    onError: (_err, _contributionId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(contributionsQueryKey(goalId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contributionsQueryKey(goalId) });
    },
  });

  function handleDelete(contributionId: string) {
    if (typeof window !== "undefined" && !window.confirm("Удалить запись? Это действие нельзя отменить.")) {
      return;
    }
    deleteMutation.mutate(contributionId);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-heading text-base font-medium">История</h3>

      {contributions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет ни одного взноса.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {contributions.map((c) => {
            const isNegative = c.amount < 0n;
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="w-24 shrink-0 text-muted-foreground">
                  {format(parseISO(c.occurredAt), "d MMM yyyy", { locale: ru })}
                </span>
                <span
                  className="w-28 shrink-0 font-semibold tabular-nums"
                  style={{ color: isNegative ? "var(--negative)" : "var(--positive)" }}
                >
                  {isNegative ? "−" : "+"}
                  {formatMoney(isNegative ? -c.amount : c.amount, currency)}
                </span>
                <span className="flex-1 truncate text-muted-foreground">{c.note}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Удалить взнос"
                  onClick={() => handleDelete(c.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
