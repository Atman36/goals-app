"use client";

import { useActionState } from "react";
import { saveReflection, type ReflectionState } from "@/lib/actions/reflections";
import type { Reflection } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FieldName = "promised" | "done" | "blocked" | "learned" | "promise";

// The 5 questions, in order — growth-reactor v5 §6/§11/§12 Decisions (solo
// variant of the circle ritual). "promise" is the only required one.
const FIELDS: { name: FieldName; label: string; maxLength: number; required?: boolean }[] = [
  { name: "promised", label: "Что я обещал себе на прошлую неделю?", maxLength: 4000 },
  { name: "done", label: "Что я сделал по факту?", maxLength: 4000 },
  { name: "blocked", label: "Что помешало или помогло?", maxLength: 4000 },
  { name: "learned", label: "Что я понял за эту неделю?", maxLength: 4000 },
  { name: "promise", label: "Что я обещаю себе на эту неделю?", maxLength: 2000, required: true },
];

// Reuses check-in wording, except "не в этот раз" replaces "не сегодня" — a
// promise's fate over a week, not a single day (Decisions).
const PREV_OUTCOME_OPTIONS: { value: "done" | "partial" | "skipped"; label: string }[] = [
  { value: "done", label: "Сделал" },
  { value: "partial", label: "Частично" },
  { value: "skipped", label: "Не в этот раз" },
];

// Matches woop-block.tsx / checkin-card.tsx's raw textarea styling.
const textareaClassName = cn(
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

// Native radio input, visually hidden — its label renders as a button-like
// pill that highlights when checked (text label, not color-only, per
// Decisions: outcome buttons must say what they mean).
const radioLabelClassName = cn(
  "inline-flex cursor-pointer items-center rounded-lg border border-input px-3 py-1.5 text-sm font-medium transition-colors",
  "has-checked:border-transparent has-checked:bg-primary has-checked:text-primary-foreground",
);

const initialState: ReflectionState = { status: "idle" };

/** /reflections's form (Stage0-3, growth-reactor v5 §6/§11/§12): mirrors
 *  settings-form.tsx's useActionState + native-form contract. Renders the
 *  previous week's promise (with its outcome radios) when one exists, the 5
 *  weekly questions, and an optional if-then step. */
export function ReflectionForm({
  current,
  prevPromise,
}: {
  current: Reflection | null;
  prevPromise: string | null;
}) {
  const [state, formAction, isPending] = useActionState(saveReflection, initialState);

  // "promised" is prefilled from last week's promise only on a fresh (never
  // saved) week — once this week's row exists, its own saved value wins
  // (Decisions: promised = editable snapshot, keeps rows self-contained).
  const defaults: Record<FieldName, string> = {
    promised: current ? (current.promised ?? "") : (prevPromise ?? ""),
    done: current?.done ?? "",
    blocked: current?.blocked ?? "",
    learned: current?.learned ?? "",
    promise: current?.promise ?? "",
  };

  return (
    <Card>
      {current ? (
        <CardHeader>
          <CardDescription>Рефлексия этой недели сохранена — можно дополнить.</CardDescription>
        </CardHeader>
      ) : null}
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {prevPromise ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-input p-3">
              <p className="text-sm font-medium">Обещание прошлой недели</p>
              <p className="text-sm text-muted-foreground italic">«{prevPromise}»</p>
              <div className="flex flex-wrap gap-2">
                {PREV_OUTCOME_OPTIONS.map((opt) => (
                  <label key={opt.value} className={radioLabelClassName}>
                    <input
                      type="radio"
                      name="prevOutcome"
                      value={opt.value}
                      defaultChecked={current?.prevOutcome === opt.value}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={field.name}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <textarea
                id={field.name}
                name={field.name}
                rows={3}
                maxLength={field.maxLength}
                required={field.required}
                defaultValue={defaults[field.name]}
                className={textareaClassName}
              />
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <Label htmlFor="newIfThen">Новый шаг «если — то» (необязательно)</Label>
            <Input
              id="newIfThen"
              name="newIfThen"
              placeholder="Если [ситуация] — то [действие]"
              defaultValue={current?.newIfThen ?? ""}
              maxLength={2000}
            />
          </div>

          {state.status === "error" ? <p className="text-sm text-destructive">{state.message}</p> : null}
          {state.status === "success" ? (
            <p className="text-sm" style={{ color: "var(--positive)" }}>
              {state.message}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Сохраняем…" : "Сохранить рефлексию"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
