"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveCheckin } from "@/lib/actions/checkins";
import type { CheckinOutcome } from "@/lib/validators/checkin";
import { FEELING_LABELS, OUTCOME_LABELS } from "@/lib/checkin-labels";

export type CheckinCardInitial = {
  outcome: CheckinOutcome;
  feeling: number;
  note: string | null;
};

// Order fixed here; copy lives in lib/checkin-labels.ts (shared with the
// trajectory summary) — growth-reactor v5 §5 Decisions (non-shaming outcome
// labels; text labels, never color-only).
const OUTCOME_OPTIONS: { value: CheckinOutcome; label: string }[] = [
  { value: "done", label: OUTCOME_LABELS.done },
  { value: "partial", label: OUTCOME_LABELS.partial },
  { value: "skipped", label: OUTCOME_LABELS.skipped },
];

const FEELING_OPTIONS: { value: number; label: string }[] = [1, 2, 3, 4, 5].map((value) => ({
  value,
  label: FEELING_LABELS[value],
}));

// Matches woop-block.tsx's raw textarea styling.
const textareaClassName = cn(
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

/** /today's focus-goal widget (Stage0-2, growth-reactor v5 §5/§6/§12): marks
 *  the day's outcome + feeling + an optional private note for the focus
 *  goal. One check-in per (goal, UTC day) — re-saving updates it. Wiring
 *  mirrors focus-toggle.tsx: local state seeded from `initial`, useTransition
 *  + direct server-action call, router.refresh() on success. */
export function CheckinCard({
  goalId,
  expectedDate,
  initial,
}: {
  goalId: string;
  /** The UTC day this card was rendered for, posted back verbatim so the
   *  action can refuse a submit that crossed midnight (GA-013). */
  expectedDate: string;
  initial: CheckinCardInitial | null;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(initial?.outcome ?? null);
  const [feeling, setFeeling] = useState<number | null>(initial?.feeling ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isStale, setIsStale] = useState(false);
  const [isPending, startTransition] = useTransition();

  function clearFeedback() {
    setSaved(false);
    setError(undefined);
    setIsStale(false);
  }

  function handleOutcome(value: CheckinOutcome) {
    clearFeedback();
    setOutcome(value);
  }

  function handleFeeling(value: number) {
    clearFeedback();
    setFeeling(value);
  }

  function handleNote(value: string) {
    clearFeedback();
    setNote(value);
  }

  function handleSubmit() {
    if (outcome === null || feeling === null) return;
    clearFeedback();
    startTransition(async () => {
      const result = await saveCheckin({ goalId, expectedDate, outcome, feeling, note });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
        // Nothing was written: the day rolled over while this card was open.
        // Block further submits until a reload re-renders it for the new day.
        if (result.stale) setIsStale(true);
      }
    });
  }

  const canSubmit = outcome !== null && feeling !== null && !isPending && !isStale;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Чек-ин дня</CardTitle>
        <CardDescription>
          {initial ? "Сегодня уже отмечено — можно изменить." : "Как прошёл день по этой цели?"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Действие</p>
          <div className="flex flex-wrap gap-2">
            {OUTCOME_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={outcome === opt.value ? "default" : "outline"}
                aria-pressed={outcome === opt.value}
                disabled={isPending}
                onClick={() => handleOutcome(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Состояние</p>
          <div className="flex flex-wrap gap-2">
            {FEELING_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={feeling === opt.value ? "default" : "outline"}
                aria-pressed={feeling === opt.value}
                disabled={isPending}
                onClick={() => handleFeeling(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="checkin-note">Заметка (только для вас)</Label>
          <textarea
            id="checkin-note"
            rows={2}
            maxLength={2000}
            className={textareaClassName}
            value={note}
            disabled={isPending}
            onChange={(e) => handleNote(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isStale ? (
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            Обновить страницу
          </Button>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm text-positive">
            Сохранено ✓
          </p>
        ) : null}

        <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
          {isPending ? "Сохраняем…" : "Сохранить чек-ин"}
        </Button>
      </CardContent>
    </Card>
  );
}
