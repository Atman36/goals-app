// T14 (PLAN §5 B4). Pure logic behind whether the reflection form shows the
// plan-adjustment node (the same node T13 wired into the check-in card) for
// the PREVIOUS week's promise. No DB, no React — Decisions D8 requires this
// to be testable without a component-testing library.

/** True exactly when a just-succeeded reflection save named the previous
 *  promise's outcome as honestly unfinished, and that promise names a goal to
 *  attach the node to (Decisions D1/D2/D3). */
export function shouldShowReflectionAdjustment(input: {
  status: "idle" | "success" | "error" | "stale";
  prevOutcome: "done" | "partial" | "skipped" | null;
  prevPromiseGoalId: string | null;
}): boolean {
  return (
    input.status === "success" &&
    (input.prevOutcome === "partial" || input.prevOutcome === "skipped") &&
    !!input.prevPromiseGoalId
  );
}
