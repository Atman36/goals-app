// T12 (PLAN §5 B4, "when NOT to ask"). A pure rule for whether the plan-
// adjustment question should be shown after a check-in — NOT a write gate.
// The action itself never checks this: someone who reached the form must be
// able to answer it (Decisions D5). Duplicate submissions are guarded by the
// unique index on plan_adjustments instead.

export const ADJUSTMENT_PROMPT_COOLDOWN_HOURS = 72;

export function shouldPromptAdjustment(input: {
  outcome: "done" | "partial" | "skipped";
  lastAdjustmentAt: Date | null;
  now: Date;
  isBackfill: boolean;
}): boolean {
  if (input.outcome === "done") return false;
  if (input.isBackfill) return false;
  if (input.lastAdjustmentAt !== null) {
    const hoursSince = (input.now.getTime() - input.lastAdjustmentAt.getTime()) / (60 * 60 * 1000);
    if (hoursSince < ADJUSTMENT_PROMPT_COOLDOWN_HOURS) return false;
  }
  return true;
}
