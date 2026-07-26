"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveCheckin } from "@/lib/actions/checkins";
import type { CheckinOutcome } from "@/lib/validators/checkin";
import { FEELING_LABELS, OUTCOME_LABELS } from "@/lib/checkin-labels";
import { shouldPromptAdjustment } from "@/lib/utils/plan-adjustment-prompt";
import { shouldShowAdjustmentNode } from "@/lib/utils/home-blocks";
import type { AdjustmentStepOption } from "@/lib/utils/adjustment-step";
import { PlanAdjustmentStep } from "@/components/goals/plan-adjustment-step";

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

/** The dot next to the recorded outcome. «Не сегодня» is deliberately neutral,
 *  not red: an honest mark is the North-Star action, and colouring it as a
 *  failure is exactly the punishment the methodology removed. The dot never
 *  carries meaning alone — the label sits right beside it. */
const OUTCOME_DOT: Record<CheckinOutcome, string> = {
  done: "bg-positive",
  partial: "bg-warn",
  skipped: "bg-muted-foreground",
};

// Matches woop-block.tsx's raw textarea styling.
const textareaClassName = cn(
  "w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "dark:bg-input/30",
);

/**
 * The home page's day card (B1, B7, C7): marks the day's outcome + feeling +
 * an optional private note for the focus goal. One check-in per (goal, UTC
 * day) — re-saving updates it.
 *
 * The mockup never drew the second step at all: state 02 stops at three outcome
 * buttons and a promise that «дальше спросим про состояние и заметку», state 03
 * shows an already-recorded day, and nothing in between exists. But
 * `checkinInputSchema` requires a feeling of 1–5, so without that screen the
 * day literally cannot be marked. It is built here as progressive disclosure:
 * picking an outcome is one tap and reveals the rest in the same card.
 *
 * C7: three 58px buttons stacked on a 390 viewport eat ~194px, and the second
 * step has to fit under them. So the big buttons are the *unanswered* state
 * only — once an outcome is picked they collapse to compact pills. All three
 * stay tappable, so changing the answer is still one tap, and the card halves
 * in height exactly when it needs the room.
 *
 * Invariants carried over from /today and not to be lost:
 *   - the page keys this card by the day, so a check-in typed before midnight
 *     is never re-submitted as tomorrow's;
 *   - `expectedDate` is posted back verbatim so the action can refuse a submit
 *     that crossed midnight (GA-013), and the refusal offers a page refresh;
 *   - the plan-adjustment node is NOT unmounted when it saves (T16 FIX-1) — it
 *     lives outside the view/edit branch below for that reason.
 */
export function CheckinCard({
  goalId,
  expectedDate,
  initial,
  steps,
  lastAdjustmentAt,
  stepCaption,
}: {
  goalId: string;
  /** The UTC day this card was rendered for, posted back verbatim so the
   *  action can refuse a submit that crossed midnight (GA-013). */
  expectedDate: string;
  initial: CheckinCardInitial | null;
  /** This goal's open checklist steps, already reshaped for the plan-
   *  adjustment step's step picker (T13). */
  steps: AdjustmentStepOption[];
  /** Most recent live plan-adjustment for this goal, if any — feeds the
   *  72-hour cooldown in shouldPromptAdjustment (T13). */
  lastAdjustmentAt: Date | null;
  /** «Шаг на сегодня: …», or null when there is none to name — a financial
   *  goal has no checklist at all, and a goal with no open steps has nothing
   *  to point at (B2). Null means no caption is drawn, not an empty one. */
  stepCaption: string | null;
}) {
  const router = useRouter();
  const [recorded, setRecorded] = useState<CheckinCardInitial | null>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(initial?.outcome ?? null);
  const [feeling, setFeeling] = useState<number | null>(initial?.feeling ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isStale, setIsStale] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showAdjustment, setShowAdjustment] = useState(false);

  // D2: computed client-side only, never during the initial render — a
  // server-rendered value here would disagree with the client's clock and
  // trip a hydration mismatch. Runs once on mount so the question survives a
  // reload after an honest "partial"/"skipped" that hasn't been answered yet.
  useEffect(() => {
    if (!initial) return;
    // Deliberate: this can only run post-hydration (D2) — `now: new Date()`
    // must be the client's clock, so there is no render-time value to
    // derive this from instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAdjustment(
      shouldShowAdjustmentNode({
        outcome: initial.outcome,
        prompted: shouldPromptAdjustment({
          outcome: initial.outcome,
          lastAdjustmentAt,
          now: new Date(),
          isBackfill: false,
        }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function handleEdit() {
    clearFeedback();
    setEditing(true);
  }

  function handleCancelEdit() {
    clearFeedback();
    setOutcome(recorded?.outcome ?? null);
    setFeeling(recorded?.feeling ?? null);
    setNote(recorded?.note ?? "");
    setEditing(false);
  }

  function handleSubmit() {
    if (outcome === null || feeling === null) return;
    clearFeedback();
    startTransition(async () => {
      const result = await saveCheckin({ goalId, expectedDate, outcome, feeling, note });
      if (result.ok) {
        setSaved(true);
        setRecorded({ outcome, feeling, note });
        setEditing(false);
        setShowAdjustment(
          shouldShowAdjustmentNode({
            outcome,
            prompted: shouldPromptAdjustment({
              outcome,
              lastAdjustmentAt,
              now: new Date(),
              isBackfill: false,
            }),
          }),
        );
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
    <div className="flex flex-col gap-4">
      {editing ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[clamp(24px,3.1vw,35px)] leading-[1.1] font-bold tracking-tight">
              {recorded ? "Изменить отметку" : "Как прошёл день?"}
            </h1>
            {/* C3: the day's step is an instruction, not a footnote — it does
                NOT go into the muted colour the mockup put it in. Absent
                entirely when there is no step to name (B2). */}
            {stepCaption ? (
              <p className="text-[15px] leading-relaxed text-foreground/80 text-pretty">
                {stepCaption}
              </p>
            ) : null}
          </div>

          {outcome === null ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {OUTCOME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={false}
                    disabled={isPending}
                    onClick={() => handleOutcome(opt.value)}
                    className="flex min-h-[58px] items-center justify-center rounded-2xl border-[1.5px] border-border bg-card px-4 text-base font-bold text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
                Любой ответ — это отметка. Дальше спросим про состояние и заметку.
              </p>
            </>
          ) : (
            <>
              {/* Answered: the same three options, now compact. Still all
                  present, so changing the answer stays one tap (C7). */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Что вышло</p>
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

              {/* B1: the step the mockup never drew. Required by the validator
                  — a check-in without a feeling cannot be saved at all. */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Как это ощущалось?</p>
                <div className="flex flex-wrap gap-2">
                  {FEELING_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
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
                <Label htmlFor="checkin-note">Заметка — по желанию, только для вас</Label>
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

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" type="button" disabled={!canSubmit} onClick={handleSubmit}>
                  {isPending ? "Сохраняем…" : "Сохранить"}
                </Button>
                {recorded ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleCancelEdit}
                    className="text-[13.5px] font-semibold text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
                  >
                    отменить
                  </button>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : recorded ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[13px] text-muted-foreground">сегодня отмечено</span>
              <span className="flex items-center gap-3 font-display text-[clamp(22px,2.7vw,30px)] leading-[1.1] font-bold tracking-tight">
                <span
                  aria-hidden
                  className={cn("size-3 shrink-0 rounded-full", OUTCOME_DOT[recorded.outcome])}
                />
                {OUTCOME_LABELS[recorded.outcome]} · {FEELING_LABELS[recorded.feeling].toLowerCase()}
              </span>
            </div>
            <button
              type="button"
              onClick={handleEdit}
              className="text-[13.5px] font-semibold text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
            >
              изменить
            </button>
          </div>

          {/* The no-note variant: no empty box, no placeholder — a day without
              a note simply has one fewer element. */}
          {recorded.note && recorded.note.trim() !== "" ? (
            <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[14.5px] leading-relaxed text-foreground text-pretty">
              «{recorded.note.trim()}»
            </p>
          ) : null}

          {/* B7: when the adjustment node is muted by its 72-hour cooldown, an
              honest «частично» ends here — same as a «сделал» day. */}
          {showAdjustment ? null : (
            <p className="text-[13.5px] text-muted-foreground">
              По цели №1 на сегодня всё. Завтра спросим снова.
            </p>
          )}
        </>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {isStale ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => router.refresh()}
        >
          Обновить страницу
        </Button>
      ) : null}
      {saved ? (
        <p role="status" className="sr-only">
          Сохранено
        </p>
      ) : null}

      {/* T16 FIX-1: the node is NOT dismissed when it saves, and it is mounted
          OUTSIDE the view/edit branch above so that switching back to the
          recorded view after a save cannot unmount it either. It used to be
          handed a dismissal callback that unmounted it in the same commit that
          set its result, which swallowed both the confirmation and the
          "duplicate — the step was not changed" message. */}
      {showAdjustment ? (
        <PlanAdjustmentStep
          goalId={goalId}
          source="checkin"
          expectedToken={expectedDate}
          steps={steps}
        />
      ) : null}
    </div>
  );
}
