"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setFocusGoal } from "@/lib/actions/focus";

/** One pickable goal. Everything is pre-formatted on the server: the subtitle
 *  can contain money, and money is bigint minor units end-to-end — it must
 *  never cross a client boundary as a raw value. */
export type FocusPickerGoal = { id: string; title: string; subtitle: string };

/**
 * The day card's «pick-focus» mode (mockup state 01) and its «no goals» mode
 * (B6 — a state the mockup never drew).
 *
 * The daily loop has exactly one entry point: a цель №1 to be asked about. With
 * no goals at all there is nothing to choose from, so the card stops pretending
 * to be a question and becomes an invitation instead — the old /today answered
 * this with a generic empty state that has no place on the home page.
 *
 * Wiring mirrors focus-toggle.tsx: useTransition + a direct server-action call,
 * router.refresh() once the action's own revalidatePath has resolved. No new
 * analytics event — setFocusGoal already emits focus_goal_set.
 */
export function FocusPicker({ goals }: { goals: FocusPickerGoal[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(goals[0]?.id ?? null);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (goals.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[clamp(23px,2.9vw,33px)] leading-[1.15] font-bold tracking-tight text-pretty">
            Начните с первой цели
          </h1>
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            Одна цель, один короткий вопрос в день. Ритм и путь появятся здесь сами, когда будет что
            показать.
          </p>
        </div>
        <Button
          size="lg"
          className="self-start"
          nativeButton={false}
          render={<Link href="/goals/new">Создать цель</Link>}
        />
      </div>
    );
  }

  function handleSubmit() {
    if (!selected || isPending) return;
    setError(undefined);
    startTransition(async () => {
      const result = await setFocusGoal(selected!);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-[clamp(23px,2.9vw,33px)] leading-[1.15] font-bold tracking-tight text-pretty">
          Выберите цель, по которой будете отмечаться
        </h1>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">
          Один короткий вопрос в день по одной цели. Остальные цели остаются на месте — их можно
          вести как раньше.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Native radios, visually hidden — same pattern as reflection-form.tsx
            and plan-adjustment-step.tsx: the checked state is carried by the
            ring AND the filled dot, never by colour alone. */}
        {goals.map((goal) => (
          <label
            key={goal.id}
            className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-input bg-card px-4 transition-colors has-checked:border-primary"
          >
            <input
              type="radio"
              name="focus-goal"
              className="sr-only"
              checked={selected === goal.id}
              disabled={isPending}
              onChange={() => setSelected(goal.id)}
            />
            {/* group-has-[:checked] rather than peer-checked: the dot is a
                descendant of the input's sibling, not a sibling itself, so the
                `~` combinator peer-* compiles to would never match it. */}
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-input group-has-[:checked]:border-primary">
              <span className="size-[9px] rounded-full bg-primary opacity-0 group-has-[:checked]:opacity-100" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold text-foreground">{goal.title}</span>
              <span className="truncate text-[12.5px] text-muted-foreground">{goal.subtitle}</span>
            </span>
          </label>
        ))}
        <span className="text-[13px] text-muted-foreground">
          {goals.length === 1
            ? "Пока это единственная цель. Выбор можно поменять в любой день."
            : "Выбор можно поменять в любой день."}
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" type="button" disabled={!selected || isPending} onClick={handleSubmit}>
          {isPending ? "Сохраняем…" : "Отмечаться по этой цели"}
        </Button>
        <span className="text-sm text-muted-foreground">
          или{" "}
          <Link href="/goals/new" className="font-semibold text-primary hover:underline">
            создать другую
          </Link>
        </span>
      </div>
    </div>
  );
}
