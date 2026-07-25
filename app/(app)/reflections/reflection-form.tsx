"use client";

import { useActionState } from "react";
import { useQuery } from "@tanstack/react-query";
import { saveReflection, type ReflectionState } from "@/lib/actions/reflections";
import type { ReflectionWithPromiseGoal } from "@/lib/db/queries/reflections";
import { checklistQueryKey } from "@/components/goals/checklist-block";
import type { IfThenPlan } from "@/lib/validators/checklist";
import { PLAN_TYPE_LABELS } from "@/lib/plan-type-labels";
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

// Matches settings-form.tsx's <select> styling.
const selectClassName = cn(
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

const initialState: ReflectionState = { status: "idle" };

const PLAN_TYPE_OPTIONS = Object.entries(PLAN_TYPE_LABELS) as [IfThenPlan["planType"], string][];

/** Minimal shape read from the existing checklist GET endpoint — reused as-is
 *  (Boundaries: the route itself isn't touched) purely to find this week's
 *  live if-then step so the three T5 controls can prefill from it. */
async function fetchGoalChecklistForPrefill(
  goalId: string,
): Promise<{ id: string; ifThen: IfThenPlan | null }[]> {
  const res = await fetch(`/api/v1/goals/${goalId}/checklist`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data: { id: string; ifThen: IfThenPlan | null }[] };
  return json.data;
}

/** /reflections's form (Stage0-3, growth-reactor v5 §6/§11/§12): mirrors
 *  settings-form.tsx's useActionState + native-form contract. Renders the
 *  previous week's promise (with its outcome radios) when one exists, the 5
 *  weekly questions, and an optional if-then step. */
export function ReflectionForm({
  current,
  prevPromise,
  expectedWeekStart,
  activeGoals,
  defaultGoalId,
}: {
  current: ReflectionWithPromiseGoal | null;
  prevPromise: string | null;
  /** The week-start key this form was rendered for. Posted back so the action
   *  can refuse a submit that crossed the week boundary (CR-030). */
  expectedWeekStart: string;
  /** The user's active goals, fetched by the page (app/(app)/reflections/page.tsx)
   *  via the existing goals query. The page itself makes no DB call for the
   *  if-then step's own values — this component fetches those client-side
   *  from the existing checklist endpoint (see fetchGoalChecklistForPrefill). */
  activeGoals: { id: string; title: string }[];
  /** Decisions D6: the focus goal if one is set, else the first active goal in
   *  the app's own ordering. Null only when there are no active goals. */
  defaultGoalId: string | null;
}) {
  const [state, formAction, isPending] = useActionState(saveReflection, initialState);

  // Decisions D5: a soft-deleted promiseGoal reads back as promiseGoalId set
  // but promiseGoal null — the select must not silently default to a
  // DIFFERENT goal in that case, so it falls back to the placeholder instead
  // of D6's default.
  const promiseGoalDefault = current?.promiseGoal
    ? current.promiseGoal.id
    : current?.promiseGoalId
      ? ""
      : (defaultGoalId ?? "");

  // T5: prefill the if-then controls from this week's live step, if any.
  // `current.promiseGoal` (not the <select>'s live edits) is the goal this
  // step actually lives under — a soft-deleted/foreign goal (Decisions D5,
  // above) means there is nothing live to prefill from either.
  const liveIfThenGoalId = current?.promiseGoal?.id ?? null;
  const liveIfThenItemId = current?.ifThenItemId ?? null;
  const { data: goalChecklist } = useQuery({
    queryKey: checklistQueryKey(liveIfThenGoalId ?? "none"),
    queryFn: () => fetchGoalChecklistForPrefill(liveIfThenGoalId as string),
    enabled: !!liveIfThenGoalId && !!liveIfThenItemId,
  });
  const liveIfThenItem =
    goalChecklist?.find((item) => item.id === liveIfThenItemId && item.ifThen) ?? null;

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
          <input type="hidden" name="expectedWeekStart" value={expectedWeekStart} />

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
            <Label htmlFor="promiseGoalId">Цель, к которой относится обещание</Label>
            {activeGoals.length > 0 ? (
              <select
                id="promiseGoalId"
                name="promiseGoalId"
                defaultValue={promiseGoalDefault}
                className={selectClassName}
              >
                {promiseGoalDefault === "" ? (
                  <option value="" disabled>
                    Выберите цель
                  </option>
                ) : null}
                {activeGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">
                Активных целей нет — обещание сохранится без привязки к цели
              </p>
            )}
            {current?.promiseGoalId && !current.promiseGoal ? (
              <p className="text-sm text-muted-foreground">Цель удалена</p>
            ) : null}
          </div>

          {/* T5: structural if-then step, always attached to the promise's
              goal (Decisions #1) — disabled with an explanation when there is
              no goal to attach it to. Keyed on the live item's id so a fresh
              defaultValue applies once the prefill fetch resolves (uncontrolled
              inputs otherwise ignore a defaultValue change after mount). */}
          <div className="flex flex-col gap-2 rounded-2xl border border-input p-3">
            <p className="text-sm font-medium">Новый шаг «если — то» (необязательно)</p>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Шаг «если—то» привязывается к цели обещания
              </p>
            ) : null}
            <div key={liveIfThenItem?.id ?? "empty"} className="flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ifThenTrigger">Если</Label>
                <Input
                  id="ifThenTrigger"
                  name="ifThenTrigger"
                  placeholder="ситуация"
                  defaultValue={liveIfThenItem?.ifThen?.trigger ?? ""}
                  maxLength={280}
                  disabled={activeGoals.length === 0}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ifThenAction">То</Label>
                <Input
                  id="ifThenAction"
                  name="ifThenAction"
                  placeholder="действие"
                  defaultValue={liveIfThenItem?.ifThen?.action ?? ""}
                  maxLength={280}
                  disabled={activeGoals.length === 0}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ifThenPlanType">Тип плана</Label>
                <select
                  id="ifThenPlanType"
                  name="ifThenPlanType"
                  defaultValue={liveIfThenItem?.ifThen?.planType ?? "initiation"}
                  disabled={activeGoals.length === 0}
                  className={selectClassName}
                >
                  {PLAN_TYPE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {state.status === "error" ? <p className="text-sm text-destructive">{state.message}</p> : null}
          {state.status === "success" ? (
            <p className="text-sm" style={{ color: "var(--positive)" }}>
              {state.message}
            </p>
          ) : null}

          {/* CR-030: the week rolled over between render and submit. Nothing was
              written — the typed answers are still in the fields, so the user
              can copy them out before reloading into the new week's form. */}
          {state.status === "stale" ? (
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-destructive p-3">
              <p className="text-sm text-destructive">{state.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="self-start"
              >
                Обновить страницу
              </Button>
            </div>
          ) : null}

          <Button type="submit" disabled={isPending || state.status === "stale"} className="self-start">
            {isPending ? "Сохраняем…" : "Сохранить рефлексию"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
