"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WoopInput } from "@/lib/validators/woop";

type FieldKey = keyof WoopInput;

// Field order + copy fixed — PRD §3.2 WOOP step (T11 spec).
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

// Matches goal-form.tsx's existing raw textarea styling (description field).
const textareaClassName = cn(
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

/** Step 3 (final) of the goal wizard (PRD §3.2 Phase 2) — optional,
 *  skippable, no back navigation. All 4 fields empty ⇒ "Создать цель" creates
 *  without WOOP; 1–3 filled ⇒ blocked with an inline hint; "Пропустить"
 *  always creates without WOOP regardless of field state. */
export function WizardWoopStep({
  pending,
  error,
  onCreate,
}: {
  pending: boolean;
  error: string | null;
  onCreate: (woop: WoopInput | null) => void;
}) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    wish: "",
    outcome: "",
    obstacle: "",
    plan: "",
  });
  const [showHint, setShowHint] = useState(false);

  const filledCount = FIELDS.filter(({ key }) => values[key].trim() !== "").length;

  function setField(key: FieldKey, value: string) {
    setShowHint(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleCreate() {
    if (filledCount === 0) {
      onCreate(null);
      return;
    }
    if (filledCount < FIELDS.length) {
      setShowHint(true);
      return;
    }
    onCreate(values);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold">WOOP — образ результата</h2>
        <p className="text-sm text-muted-foreground">
          Четыре шага: желание, лучший исход, внутреннее препятствие и план.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {FIELDS.map(({ key, label, hint }) =>
          key === "wish" ? (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`woop-${key}`}>{label}</Label>
              <Input
                id={`woop-${key}`}
                placeholder={hint}
                value={values[key]}
                disabled={pending}
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
                disabled={pending}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ),
        )}
      </div>

      {showHint ? (
        <p className="text-sm text-destructive">Заполните все четыре поля или очистите их</p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" className="w-full" disabled={pending} onClick={handleCreate}>
          {pending ? "Сохраняем…" : "Создать цель"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => onCreate(null)}
        >
          Пропустить
        </Button>
      </div>
    </div>
  );
}
