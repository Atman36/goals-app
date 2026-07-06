"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveWoop, markWoopLived } from "@/lib/actions/woop";
import type { WoopInput } from "@/lib/validators/woop";
import type { WoopEntry } from "@/lib/db/schema";

type FieldKey = keyof WoopInput;

// Field order + copy fixed — PRD §3.2 WOOP methodology. Verbatim copy of
// wizard-woop-step.tsx's FIELDS (T12's Boundaries forbid touching wizard/step
// components to extract a shared const).
const FIELDS: { key: FieldKey; label: string; hint: string }[] = [
  { key: "wish", label: "Желание", hint: "Сформулируйте в 3–6 словах" },
  {
    key: "outcome",
    label: "Лучший результат",
    hint: "Каким будет лучший исход? Что вы почувствуете?",
  },
  {
    key: "obstacle",
    label: "Внутреннее препятствие",
    hint: "Не «нет времени», а что внутри вас мешает",
  },
  { key: "plan", label: "План", hint: "Если [триггер] → то я [действие]" },
];

// Matches goal-form.tsx / wizard-woop-step.tsx's raw textarea styling.
const textareaClassName = cn(
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

function toFormValues(entry: WoopEntry | null): Record<FieldKey, string> {
  return {
    wish: entry?.wish ?? "",
    outcome: entry?.outcome ?? "",
    obstacle: entry?.obstacle ?? "",
    plan: entry?.plan ?? "",
  };
}

// "d MMMM yyyy", explicit "ru-RU" locale (never the runtime's implicit locale
// — hydration-mismatch trap noted in T12's spec). Intl appends a trailing
// "г." that date-fns's equivalent format elsewhere on this page doesn't
// produce, so it's stripped to match.
function formatRuDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(date)
    .replace(/\s*г\.$/, "");
}

/** Goal page's WOOP block (T12, PRD §3.3.7) — shows the saved Wish / Outcome
 *  / Obstacle / Plan, lets the owner edit or add it, and records "прожили
 *  образ" (re-lived the mental image). Optimistic local state hydrated from
 *  `initialWoop`, mirroring checklist-block.tsx's client-island pattern;
 *  failed saves roll the state back (Decision 6). */
export function WoopBlock({ goalId, initialWoop }: { goalId: string; initialWoop: WoopEntry | null }) {
  const [woop, setWoop] = useState(initialWoop);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<FieldKey, string>>(() => toFormValues(initialWoop));
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function openEdit() {
    setValues(toFormValues(woop));
    setError(undefined);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError(undefined);
  }

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const input: WoopInput = {
      wish: values.wish.trim(),
      outcome: values.outcome.trim(),
      obstacle: values.obstacle.trim(),
      plan: values.plan.trim(),
    };
    setError(undefined);
    const previous = woop;
    const optimistic: WoopEntry = {
      id: previous?.id ?? "optimistic",
      goalId,
      wish: input.wish,
      outcome: input.outcome,
      obstacle: input.obstacle,
      plan: input.plan,
      lastLivedAt: previous?.lastLivedAt ?? null,
      createdAt: previous?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    setWoop(optimistic);
    setEditing(false);
    startTransition(async () => {
      const result = await saveWoop(goalId, input);
      if (!result.ok) {
        setWoop(previous);
        setError(result.error);
        setEditing(true);
      }
    });
  }

  function handleLive() {
    if (!woop) return;
    setError(undefined);
    const previous = woop;
    setWoop({ ...previous, lastLivedAt: new Date() });
    startTransition(async () => {
      const result = await markWoopLived(goalId);
      if (!result.ok) {
        setWoop(previous);
        setError(result.error);
      }
    });
  }

  const livedLabel = woop?.lastLivedAt
    ? `Последний раз проживали: ${formatRuDate(woop.lastLivedAt)}`
    : "Ещё ни разу не проживали";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-base font-medium">Образ цели (WOOP)</h3>

      {editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-2xl bg-muted/50 p-3">
          {FIELDS.map(({ key, label, hint }) =>
            key === "wish" ? (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={`woop-${key}`}>{label}</Label>
                <Input
                  id={`woop-${key}`}
                  placeholder={hint}
                  value={values[key]}
                  disabled={isPending}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </div>
            ) : (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={`woop-${key}`}>{label}</Label>
                <textarea
                  id={`woop-${key}`}
                  rows={3}
                  placeholder={hint}
                  className={textareaClassName}
                  value={values[key]}
                  disabled={isPending}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </div>
            ),
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={handleCancel}>
              Отмена
            </Button>
          </div>
        </form>
      ) : woop ? (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1 rounded-2xl bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm whitespace-pre-wrap">{woop[key]}</dd>
              </div>
            ))}
          </dl>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{livedLabel}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={handleLive}>
                Прожить образ
              </Button>
              <Button type="button" variant="ghost" disabled={isPending} onClick={openEdit}>
                Редактировать
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">Добавьте WOOP — образ результата и план на препятствия.</p>
          <Button type="button" variant="outline" onClick={openEdit}>
            Добавить WOOP
          </Button>
        </div>
      )}
    </div>
  );
}
