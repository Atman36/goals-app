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
import {
  MINOR_UNITS_PER_MAJOR,
  calcFinancialProgress,
  formatMoney,
  parseMajorDecimalToMinor,
} from "@/lib/utils/money";
import { calcRequiredMonthlyPace, calcTrailingMonthlyPace, comparePace } from "@/lib/utils/pace";
import { cn } from "@/lib/utils";
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

/** Must match the `code` the contributions route sends with its 409. */
const IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

/**
 * How a submit ended, from the idempotency key's point of view.
 * - `created`   — the server stored this payload under the key.
 * - `replayed`  — the key already held a byte-identical payload (exact replay).
 * - `key_reused`— the key already held a DIFFERENT payload; this data was not stored.
 * - `unknown`   — network error / timeout / 5xx: the server may or may not have stored it.
 */
export type ContributionSubmitOutcome = "created" | "replayed" | "key_reused" | "unknown";

/**
 * Idempotency-key rotation contract (CR-025).
 *
 * Rotate after every outcome the SERVER settled — created, exact replay, and reused-key
 * conflict alike. Once the server has bound a key, reusing it can only ever produce a
 * replay or a 409, so a pinned key would silently discard every later contribution.
 *
 * Keep the key only when the outcome is genuinely unknown, which is precisely the case
 * a retry must be idempotent for.
 */
export function shouldRotateIdempotencyKey(outcome: ContributionSubmitOutcome): boolean {
  return outcome !== "unknown";
}

/** Carries the outcome so onError can apply the same rotation contract as onSuccess. */
class ContributionSubmitError extends Error {
  readonly outcome: ContributionSubmitOutcome;

  constructor(outcome: ContributionSubmitOutcome, message: string) {
    super(message);
    this.name = "ContributionSubmitError";
    this.outcome = outcome;
  }
}

/** Right-column ring + "X из Y" metric — reactive to the same contributions
 *  cache QuickAddSheet writes to (shared TanStack Query key), so a
 *  successful/optimistic quick-add updates this without prop drilling. */
export function FinancialProgressHeader({
  goalId,
  currency,
  initialAmount,
  targetAmount,
  deadline,
  initialContributions,
}: {
  goalId: string;
  currency: Currency;
  initialAmount: bigint;
  targetAmount: bigint;
  deadline: string;
  initialContributions: Contribution[];
}) {
  const { data: contributions } = useContributionsQuery(goalId, initialContributions);
  const saved = sumSaved(initialAmount, contributions);
  const percent = calcFinancialProgress(saved, targetAmount);
  const remaining = saved >= targetAmount ? 0n : targetAmount - saved;

  // Required monthly pace vs. actual trailing pace → "в графике / отстаёте /
  // опережаете" (PRD §3.3.4). Hidden once the target is met or the deadline
  // has passed (requiredPace null/0).
  const requiredPace = calcRequiredMonthlyPace(targetAmount, saved, new Date(deadline));
  const paceStatus =
    requiredPace !== null && requiredPace > 0n
      ? comparePace(requiredPace, calcTrailingMonthlyPace(contributions))
      : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <ProgressRing progress={percent} size={140} strokeWidth={14} />
      <div className="flex flex-col gap-1">
        <span className="font-display text-[26px] leading-none font-bold tracking-tight">
          {formatMoney(saved, currency)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          из {formatMoney(targetAmount, currency)} · осталось {formatMoney(remaining, currency)}
        </span>
        {paceStatus && requiredPace !== null ? (
          <span
            className={cn(
              "mt-2 inline-block self-start rounded-full px-3 py-1.5 text-xs font-bold",
              paceStatus === "behind"
                ? "bg-warn/12 text-warn"
                : paceStatus === "ahead"
                  ? "bg-positive/12 text-positive"
                  : "bg-primary/12 text-primary",
            )}
          >
            {paceStatus === "behind"
              ? "Нужно ускориться"
              : paceStatus === "ahead"
                ? "Опережаете график"
                : "В графике"}{" "}
            · ~{formatMoney(requiredPace, currency)}/мес
          </span>
        ) : null}
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
    if (result.ok) router.replace(`/goals/${goalId}?celebrate=1`);
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
  // Exact, no Number hop (GA-014 / MONEY-001): a preset is a whole major-unit
  // amount scaled in bigint, and a typed amount is parsed from its own digits.
  // An unparseable or empty field is 0n, which handleSubmit rejects.
  const amountMinor =
    selectedPreset !== null
      ? BigInt(selectedPreset) * MINOR_UNITS_PER_MAJOR
      : (parseMajorDecimalToMinor(customAmount) ?? 0n);
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
      const body = (await res.json().catch(() => null)) as
        | (Partial<ContributionPostResponse> & { code?: string })
        | null;

      if (res.status === 409 && body?.code === IDEMPOTENCY_KEY_REUSED) {
        throw new ContributionSubmitError(
          "key_reused",
          "Этот взнос не сохранён: ключ уже занят другими данными. Попробуйте ещё раз.",
        );
      }
      if (!res.ok || !body?.data) {
        throw new ContributionSubmitError("unknown", "Не удалось сохранить взнос");
      }
      return body as ContributionPostResponse;
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
    onError: (err, _vars, context) => {
      const outcome: ContributionSubmitOutcome =
        err instanceof ContributionSubmitError ? err.outcome : "unknown";

      // The write did not land — drop the optimistic entry so the UI stops claiming it did.
      if (context?.previous) {
        queryClient.setQueryData(contributionsQueryKey(goalId), context.previous);
      }

      setError(
        outcome === "key_reused"
          ? "Этот взнос не сохранён — данные разошлись с уже сохранёнными. Проверьте список и попробуйте ещё раз."
          : "Не удалось сохранить взнос. Попробуйте ещё раз.",
      );

      // A reused key is settled server-side: retrying with it can never store anything.
      if (shouldRotateIdempotencyKey(outcome)) idRef.current = null;
    },
    onSuccess: (result, _vars, context) => {
      const outcome: ContributionSubmitOutcome = result.data.duplicate ? "replayed" : "created";

      // Rotate FIRST and unconditionally: an early return here is what pinned the key
      // forever and silently dropped every later contribution (CR-025).
      if (shouldRotateIdempotencyKey(outcome)) idRef.current = null;

      // An exact replay is already counted in the stored total, so re-running the
      // threshold math would double-count it and fire a bogus celebration. The row is
      // genuinely saved though, so the form still closes and resets as a success.
      if (outcome === "replayed") {
        resetForm();
        return;
      }

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

      resetForm();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contributionsQueryKey(goalId) });
    },
  });

  /** Post-save cleanup. Does NOT touch idRef — rotation is owned solely by the
   *  onSuccess/onError contract above (shouldRotateIdempotencyKey). */
  function resetForm() {
    setOpen(false);
    setSelectedPreset(null);
    setCustomAmount("");
    setNote("");
    setDate(todayIso());
    setIsNegative(false);
    setError(undefined);
  }

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
      router.replace(`/goals/${goalId}?celebrate=1`);
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
