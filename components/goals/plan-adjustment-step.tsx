"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { savePlanAdjustment, type SavePlanAdjustmentResult } from "@/lib/actions/plan-adjustments";
import { PLAN_ADJUSTMENT_BARRIERS, type PlanAdjustmentBarrier, type PlanAdjustmentSource } from "@/lib/validators/plan-adjustment";
import {
  ADJUSTMENT_BARRIER_HEADING,
  ADJUSTMENT_BARRIER_HINT,
  ADJUSTMENT_DECISION_HEADING,
  ADJUSTMENT_EXIT_HANDOFF,
  ADJUSTMENT_EXIT_HEADING,
  BARRIER_LABELS,
  DECISION_LABELS,
} from "@/lib/plan-adjustment-labels";
import { adjustmentResultMessage, decisionAvailability, type AdjustmentStepOption } from "@/lib/utils/adjustment-step";

type MainDecision = "keep" | "smaller" | "change_trigger" | "add_coping_plan";

// Fixed order per spec step 3.4 — keep, smaller, change_trigger, add_coping_plan.
const MAIN_DECISIONS: MainDecision[] = ["keep", "smaller", "change_trigger", "add_coping_plan"];

// Native radio input, visually hidden — matches reflection-form.tsx's pattern
// (label renders as a button-like pill, checked state carries the meaning in
// text, not color alone).
const radioLabelClassName = cn(
  "inline-flex cursor-pointer items-center rounded-lg border border-input px-3 py-1.5 text-sm transition-colors",
  "has-checked:border-transparent has-checked:bg-primary has-checked:text-primary-foreground",
);

/**
 * The plan-adjustment node's second step (T13, PLAN §5 B4): shown right under
 * an honest "partial"/"skipped" check-in, in the same card (Decisions D1).
 * Order is fixed by D4 — a barrier first (one touch), then a decision about
 * tomorrow's step; nothing below the barrier renders until one is picked.
 *
 * Purely a view: which decisions are pickable and every string shown here
 * live in lib/utils/adjustment-step.ts and lib/plan-adjustment-labels.ts
 * (D8) — there is no component-testing library in this project, so the
 * testable logic has to live outside the component.
 */
export function PlanAdjustmentStep({
  goalId,
  source,
  expectedToken,
  steps,
  onDone,
}: {
  goalId: string;
  source: PlanAdjustmentSource;
  expectedToken: string;
  steps: AdjustmentStepOption[];
  onDone?: () => void;
}) {
  const [barrier, setBarrier] = useState<PlanAdjustmentBarrier | null>(null);
  const [decision, setDecision] = useState<MainDecision | null>(null);
  const [smallerStepId, setSmallerStepId] = useState<string | null>(null);
  const [smallerTitle, setSmallerTitle] = useState("");
  const [triggerStepId, setTriggerStepId] = useState<string | null>(null);
  const [triggerText, setTriggerText] = useState("");
  const [copingTrigger, setCopingTrigger] = useState("");
  const [copingAction, setCopingAction] = useState("");
  const [result, setResult] = useState<SavePlanAdjustmentResult | null>(null);
  // Set once a pause_goal/drop_goal submit succeeds. Deliberately does NOT
  // trigger onDone (unlike the main flow below): the handoff line + "Открыть
  // цель" link this unlocks must stay on screen until the person acts on
  // them, not vanish the instant the card would otherwise be dismissed.
  const [exitDone, setExitDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const availability = decisionAvailability(steps);
  const triggerOptions = steps.filter((s) => s.hasIfThen);

  function availabilityFor(d: MainDecision): { enabled: boolean; reason: string | null } {
    if (d === "smaller") return availability.smaller;
    if (d === "change_trigger") return availability.change_trigger;
    return { enabled: true, reason: null };
  }

  function resetDecisionFields() {
    setDecision(null);
    setSmallerStepId(null);
    setSmallerTitle("");
    setTriggerStepId(null);
    setTriggerText("");
    setCopingTrigger("");
    setCopingAction("");
  }

  function isMainReady(): boolean {
    switch (decision) {
      case "keep":
        return true;
      case "smaller":
        return smallerStepId !== null && smallerTitle.trim().length > 0;
      case "change_trigger":
        return triggerStepId !== null && triggerText.trim().length > 0;
      case "add_coping_plan":
        return copingTrigger.trim().length > 0 && copingAction.trim().length > 0;
      default:
        return false;
    }
  }

  function handleSubmitMain() {
    if (!barrier || !decision || !isMainReady() || isPending) return;
    const base = { goalId, source, expectedToken, barrier, decision };
    const input =
      decision === "smaller"
        ? { ...base, checklistItemId: smallerStepId, stepTitle: smallerTitle.trim() }
        : decision === "change_trigger"
          ? { ...base, checklistItemId: triggerStepId, trigger: triggerText.trim() }
          : decision === "add_coping_plan"
            ? { ...base, copingTrigger: copingTrigger.trim(), copingAction: copingAction.trim() }
            : base;
    startTransition(async () => {
      const res = await savePlanAdjustment(input);
      setResult(res);
      if (res.ok) {
        resetDecisionFields();
        onDone?.();
      }
    });
  }

  function handleExit(exitDecision: "pause_goal" | "drop_goal") {
    if (!barrier || isPending) return;
    startTransition(async () => {
      const res = await savePlanAdjustment({ goalId, source, expectedToken, barrier, decision: exitDecision });
      setResult(res);
      if (res.ok) setExitDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{ADJUSTMENT_BARRIER_HEADING}</p>
        <p className="text-xs text-muted-foreground">{ADJUSTMENT_BARRIER_HINT}</p>
        <div className="flex flex-wrap gap-2">
          {PLAN_ADJUSTMENT_BARRIERS.map((b) => (
            <Button
              key={b}
              type="button"
              size="sm"
              variant={barrier === b ? "default" : "outline"}
              aria-pressed={barrier === b}
              disabled={isPending}
              onClick={() => setBarrier(b)}
            >
              {BARRIER_LABELS[b]}
            </Button>
          ))}
        </div>
      </div>

      {barrier ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{ADJUSTMENT_DECISION_HEADING}</p>
            <div className="flex flex-col gap-2">
              {MAIN_DECISIONS.map((d) => {
                const a = availabilityFor(d);
                return (
                  <div key={d} className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant={decision === d ? "default" : "outline"}
                      aria-pressed={decision === d}
                      disabled={isPending || !a.enabled}
                      onClick={() => setDecision(d)}
                      className="self-start"
                    >
                      {DECISION_LABELS[d]}
                    </Button>
                    {!a.enabled && a.reason ? (
                      <p className="text-xs text-muted-foreground">{a.reason}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {decision === "smaller" ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Какой шаг?</p>
                <div className="flex flex-col gap-2">
                  {steps.map((s) => (
                    <label key={s.id} className={radioLabelClassName}>
                      <input
                        type="radio"
                        name="adjustment-smaller-step"
                        checked={smallerStepId === s.id}
                        disabled={isPending}
                        onChange={() => setSmallerStepId(s.id)}
                        className="sr-only"
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adjustment-smaller-title">Каким будет шаг поменьше?</Label>
                <Input
                  id="adjustment-smaller-title"
                  maxLength={200}
                  value={smallerTitle}
                  disabled={isPending}
                  onChange={(e) => setSmallerTitle(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {decision === "change_trigger" ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Какой шаг?</p>
                <div className="flex flex-col gap-2">
                  {triggerOptions.map((s) => (
                    <label key={s.id} className={radioLabelClassName}>
                      <input
                        type="radio"
                        name="adjustment-trigger-step"
                        checked={triggerStepId === s.id}
                        disabled={isPending}
                        onChange={() => setTriggerStepId(s.id)}
                        className="sr-only"
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adjustment-trigger-text">Когда и где теперь?</Label>
                <Input
                  id="adjustment-trigger-text"
                  maxLength={280}
                  value={triggerText}
                  disabled={isPending}
                  onChange={(e) => setTriggerText(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {decision === "add_coping_plan" ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="adjustment-coping-trigger">Если…</Label>
                <Input
                  id="adjustment-coping-trigger"
                  maxLength={280}
                  value={copingTrigger}
                  disabled={isPending}
                  onChange={(e) => setCopingTrigger(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adjustment-coping-action">…то</Label>
                <Input
                  id="adjustment-coping-action"
                  maxLength={280}
                  value={copingAction}
                  disabled={isPending}
                  onChange={(e) => setCopingAction(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <Button type="button" disabled={!isMainReady() || isPending} onClick={handleSubmitMain}>
            {isPending ? "Сохраняем…" : "Сохранить"}
          </Button>

          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">{ADJUSTMENT_EXIT_HEADING}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending || exitDone}
                onClick={() => handleExit("pause_goal")}
              >
                {DECISION_LABELS.pause_goal}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending || exitDone}
                onClick={() => handleExit("drop_goal")}
              >
                {DECISION_LABELS.drop_goal}
              </Button>
            </div>
            {exitDone ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted-foreground">{ADJUSTMENT_EXIT_HANDOFF}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/goals/${goalId}`}>Открыть цель</Link>}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {result ? (
        <p role="status" className={cn("text-sm", result.ok ? "text-positive" : "text-destructive")}>
          {adjustmentResultMessage(result)}
        </p>
      ) : null}
    </div>
  );
}
