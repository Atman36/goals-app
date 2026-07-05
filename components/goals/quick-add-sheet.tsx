"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressRing } from "@/components/goals/progress-ring";
import { Confetti } from "@/components/confetti";
import { markAchieved } from "@/lib/actions/goals";
import { calcFinancialProgress, formatMoney, toMinorUnits } from "@/lib/utils/money";
import type { Currency } from "@/lib/validators/goal";
import type { Contribution } from "@/lib/db/schema";
import {
  contributionsQueryKey,
  useContributionsQuery,
  type ClientContribution,
} from "@/components/goals/contribution-history";

const PRESETS_MAJOR: Record<Currency, number[]> = {
  RUB: [500, 1000, 5000, 10000],
  USD: [10, 50, 100, 500],
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function crossedThresholds(prevPercent: number, nextPercent: number) {
  const small = [25, 50, 75].some((t) => prevPercent < t && nextPercent >= t);
  const big = prevPercent < 100 && nextPercent >= 100;
  return { small, big };
}

function sumSaved(initialAmount: bigint, contributions: ClientContribution[]): bigint {
  return contributions.reduce((sum, c) => sum + c.amount, initialAmount);
}

interface ContributionPostResponse {
  data: {
    duplicate: boolean;
    contribution: { id: string; amount: string; note: string | null; occurredAt: string; createdAt: string } | null;
  };
}

/** Right-column ring + "X из Y" metric — reactive to the same contributions
 *  cache QuickAddSheet writes to (shared TanStack Query key), so a
 *  successful/optimistic quick-add updates this without prop drilling. */
export function FinancialProgressHeader({
  goalId,
  currency,
  initialAmount,
  targetAmount,
  initialContributions,
}: {
  goalId: string;
  currency: Currency;
  initialAmount: bigint;
  targetAmount: bigint;
  initialContributions: Contribution[];
}) {
  const { data: contributions } = useContributionsQuery(goalId, initialContributions);
  const saved = sumSaved(initialAmount, contributions);
  const percent = calcFinancialProgress(saved, targetAmount);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
      <ProgressRing progress={percent} size={140} strokeWidth={14} />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Накоплено</span>
        <span className="font-display text-xl font-bold">
          {formatMoney(saved, currency)} из {formatMoney(targetAmount, currency)}
        </span>
      </div>
    </div>
  );
}

/** Header "Достигнута 🎉" action — hidden by the caller once goal.status is
 *  already "achieved" (PRD §3.3 layout). Separate from the inline post-100%
 *  quick-add prompt below, though both call the same T6 Server Action. */
export function MarkAchievedButton({ goalId }: { goalId: string }) {
  const router = useRouter();

  async function handleClick() {
    if (typeof window !== "undefined" && !window.confirm("Отметить цель достигнутой?")) return;
    const result = await markAchieved(goalId);
    if (result.ok) router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick}>
      Достигнута 🎉
    </Button>
  );
}

export function QuickAddSheet({
  goalId,
  currency,
  initialAmount,
  targetAmount,
  initialContributions,
  autoOpen,
}: {
  goalId: string;
  currency: Currency;
  initialAmount: bigint;
  targetAmount: bigint;
  initialContributions: Contribution[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Seeds/subscribes to the shared contributions cache so a submit here is
  // visible to FinancialProgressHeader immediately (same query key) — see
  // contribution-history.tsx's module doc for why this is a shared cache.
  useContributionsQuery(goalId, initialContributions);

  // `?add=1` is only meaningful at initial load (it doesn't change without a
  // full navigation), so it's used as the initial state, not synced via effect.
  const [open, setOpen] = useState(autoOpen ?? false);
  const [isNegative, setIsNegative] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | undefined>();
  const [confettiVariant, setConfettiVariant] = useState<"small" | "big" | null>(null);
  const [showAchievedPrompt, setShowAchievedPrompt] = useState(false);

  const idRef = useRef<string | null>(null);

  const presets = PRESETS_MAJOR[currency];
  const amountMajor = selectedPreset ?? Number(customAmount || 0);
  const amountMinor = Number.isFinite(amountMajor) && amountMajor > 0 ? toMinorUnits(amountMajor) : 0n;
  const signedAmountMinor = isNegative ? -amountMinor : amountMinor;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/goals/${goalId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idRef.current,
          amountMinor: amountMinor.toString(),
          note: note.trim() || undefined,
          occurredAt: date,
          isNegative,
          isPreset: selectedPreset !== null,
        }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить взнос");
      return res.json() as Promise<ContributionPostResponse>;
    },
    onMutate: async () => {
      if (!idRef.current) idRef.current = crypto.randomUUID();

      await queryClient.cancelQueries({ queryKey: contributionsQueryKey(goalId) });
      const previous = queryClient.getQueryData<ClientContribution[]>(contributionsQueryKey(goalId));
      const prevSaved = sumSaved(initialAmount, previous ?? []);

      const optimisticEntry: ClientContribution = {
        id: idRef.current,
        amount: signedAmountMinor,
        note: note.trim() || null,
        occurredAt: date,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ClientContribution[]>(contributionsQueryKey(goalId), (old) =>
        [optimisticEntry, ...(old ?? [])].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
      );

      return { previous, prevSaved };
    },
    onError: (_err, _vars, context) => {
      setError("Не удалось сохранить взнос. Попробуйте ещё раз.");
      if (context?.previous) {
        queryClient.setQueryData(contributionsQueryKey(goalId), context.previous);
      }
    },
    onSuccess: (result, _vars, context) => {
      if (result.data.duplicate) return;

      const prevSaved = context?.prevSaved ?? initialAmount;
      const prevPercent = calcFinancialProgress(prevSaved, targetAmount) * 100;
      const nextSaved = prevSaved + signedAmountMinor;
      const nextPercent = calcFinancialProgress(nextSaved, targetAmount) * 100;
      const { small, big } = crossedThresholds(prevPercent, nextPercent);

      if (big) {
        setConfettiVariant("big");
        setShowAchievedPrompt(true);
      } else if (small) {
        setConfettiVariant("small");
      }

      setOpen(false);
      setSelectedPreset(null);
      setCustomAmount("");
      setNote("");
      setDate(todayIso());
      setIsNegative(false);
      setError(undefined);
      idRef.current = null;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contributionsQueryKey(goalId) });
    },
  });

  function handlePresetClick(value: number) {
    setSelectedPreset(value);
    setCustomAmount("");
  }

  function handleCustomChange(value: string) {
    setCustomAmount(value);
    setSelectedPreset(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountMinor <= 0n) {
      setError("Введите сумму больше нуля");
      return;
    }
    setError(undefined);
    mutation.mutate();
  }

  async function handleMarkAchieved() {
    if (typeof window !== "undefined" && !window.confirm("Отметить цель достигнутой?")) return;
    const result = await markAchieved(goalId);
    if (result.ok) {
      setShowAchievedPrompt(false);
      router.refresh();
    }
  }

  return (
    <>
      {confettiVariant ? (
        <Confetti variant={confettiVariant} onDone={() => setConfettiVariant(null)} />
      ) : null}

      <Sheet open={open} onOpenChange={(next) => setOpen(next)}>
        <SheetTrigger render={<Button />}>+ Добавить</SheetTrigger>

        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <SheetHeader>
              <SheetTitle>Новый взнос</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col items-center gap-1 px-4">
              <span className="font-display text-[46px] leading-none font-bold" style={{ color: "var(--primary)" }}>
                {isNegative ? "−" : "+"}
                {formatMoney(amountMinor, currency)}
              </span>
            </div>

            <div className="flex gap-2 px-4">
              <Button
                type="button"
                variant={!isNegative ? "default" : "outline"}
                className="flex-1"
                onClick={() => setIsNegative(false)}
              >
                Пополнение
              </Button>
              <Button
                type="button"
                variant={isNegative ? "default" : "outline"}
                className="flex-1"
                onClick={() => setIsNegative(true)}
              >
                Списание
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2 px-4">
              {presets.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={selectedPreset === p ? "default" : "outline"}
                  onClick={() => handlePresetClick(p)}
                >
                  +{p}
                </Button>
              ))}
            </div>

            <div className="flex flex-col gap-2 px-4">
              <Label htmlFor="customAmount">Своя сумма</Label>
              <Input
                id="customAmount"
                inputMode="decimal"
                placeholder="0"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 px-4">
              <Label htmlFor="note">Заметка</Label>
              <Input
                id="note"
                placeholder="Например: премия"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 px-4">
              <Label htmlFor="occurredAt">Дата</Label>
              <Input id="occurredAt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}

            <SheetFooter>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={mutation.isPending || amountMinor <= 0n}
              >
                {mutation.isPending ? "Сохраняем…" : `Добавить ${formatMoney(amountMinor, currency)}`}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {showAchievedPrompt ? (
        <div className="flex animate-pop-in items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-sm">
          <span>Цель достигнута?</span>
          <Button type="button" size="sm" onClick={handleMarkAchieved}>
            Отметить 🎉
          </Button>
        </div>
      ) : null}
    </>
  );
}
