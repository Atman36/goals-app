// T14 (PLAN §5 B4). Pure logic behind whether the reflection form shows the
// plan-adjustment node (the same node T13 wired into the check-in card) for
// the PREVIOUS week's promise. No DB, no React — Decisions D8 requires this
// to be testable without a component-testing library.

/** True exactly when a just-succeeded reflection save named the previous
 *  promise's outcome as honestly unfinished, and that promise names a goal
 *  that can still accept an adjustment (Decisions D1/D2/D3).
 *
 *  T16 FIX-3: "names a goal" is not enough. `promiseGoalId` is a raw foreign
 *  key that outlives the goal's usable life, and savePlanAdjustment refuses
 *  anything that is not live AND active — so a node opened for a deleted,
 *  archived or achieved goal can only ever end in "Цель недоступна", after
 *  the person has already picked a barrier and a decision. `prevPromiseGoalActive`
 *  carries that liveness so the node is never offered in the first place;
 *  it is a legitimate state, not an error, so nothing is rendered in its place. */
export function shouldShowReflectionAdjustment(input: {
  status: "idle" | "success" | "error" | "stale";
  prevOutcome: "done" | "partial" | "skipped" | null;
  prevPromiseGoalId: string | null;
  prevPromiseGoalActive: boolean;
}): boolean {
  return (
    input.status === "success" &&
    (input.prevOutcome === "partial" || input.prevOutcome === "skipped") &&
    !!input.prevPromiseGoalId &&
    input.prevPromiseGoalActive
  );
}
