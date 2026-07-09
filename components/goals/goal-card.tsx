import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getSignedMediaUrl } from "@/lib/storage";
import { calcFinancialProgress, formatMoney } from "@/lib/utils/money";
import type { GoalWithProgress } from "@/lib/db/queries/goals";
import type { Currency } from "@/lib/validators/goal";

const CURRENCY_SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

/** goal.checklistTotal > 0 ⇒ doneItems/totalItems; else 0 — mirrors the
 *  (unexported) goalProgress() in lib/db/queries/goals.ts, per PRD §4. */
function goalProgress(goal: GoalWithProgress): number {
  if (goal.kind === "financial") {
    // Invariant enforced by lib/validators/goal.ts: financial ⇒ currency & targetAmount set.
    return calcFinancialProgress(goal.saved, goal.targetAmount ?? 0n);
  }
  if (goal.checklistTotal > 0) return goal.checklistDone / goal.checklistTotal;
  return 0;
}

/** The bucket is private (lib/storage.ts) — covers always go through a signed
 *  read URL. Falls back to null (gradient placeholder) instead of throwing:
 *  Supabase env vars may be absent at runtime, and a broken cover must never
 *  crash the dashboard. */
async function resolveCoverUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  try {
    return await getSignedMediaUrl(storagePath);
  } catch {
    return null;
  }
}

export async function GoalCard({ goal, isFocus }: { goal: GoalWithProgress; isFocus?: boolean }) {
  const coverUrl = await resolveCoverUrl(goal.coverStoragePath);
  const isFinancial = goal.kind === "financial";
  const isAchieved = goal.status === "achieved";
  const percent = Math.round(goalProgress(goal) * 100);

  const metricLine = isFinancial
    ? `${formatMoney(goal.saved, goal.currency as Currency)} из ${formatMoney(goal.targetAmount ?? 0n, goal.currency as Currency)}`
    : `${goal.checklistDone} из ${goal.checklistTotal} шагов`;

  const badgeLabel = isFinancial ? CURRENCY_SYMBOL[goal.currency as Currency] : "шаги";

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] bg-card ring-1 ring-foreground/8">
      <Link
        href={`/goals/${goal.id}`}
        className="relative block h-[150px] shrink-0 overflow-hidden"
      >
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div aria-hidden className="relative h-full w-full [background-image:var(--gradient-tile)]">
            <div className="absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.55)_0px,rgba(255,255,255,0.55)_2px,transparent_2px,transparent_14px)]" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-4xl bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground">
          {badgeLabel}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {isFocus ? (
          <Badge variant="secondary" className="w-fit">
            <Star className="text-primary" /> Цель №1
          </Badge>
        ) : null}
        <Link href={`/goals/${goal.id}`}>
          <h3 className="text-lg leading-snug font-extrabold text-foreground">{goal.title}</h3>
        </Link>

        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{metricLine}</p>
          <span className="shrink-0 font-display text-lg font-bold text-primary">{percent}%</span>
        </div>

        <Progress value={percent} aria-label="Прогресс" />

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            до {format(parseISO(goal.deadline), "d MMMM yyyy", { locale: ru })}
          </span>

          {isAchieved ? (
            <span className="text-sm font-medium">Достигнута 🎉</span>
          ) : isFinancial ? (
            <Link
              href={`/goals/${goal.id}?add=1`}
              className="rounded-4xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              + Добавить
            </Link>
          ) : (
            <Link
              href={`/goals/${goal.id}#checklist`}
              className="rounded-4xl border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Шаги →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
