// Home redesign B2. The mockup writes «Шаг на сегодня: 20 минут разговорной
// практики» under the day's question, but the product has no such concept:
// nothing anywhere picks one checklist item out of a goal and calls it today's
// step. This module is that rule, and nothing else.
//
// Two cases the mockup never draws and this module has to answer:
//   - a FINANCIAL goal has no checklist by definition, so there is never a step
//     to name. The caption is simply absent — the heading «Как прошёл день?»
//     stands alone rather than trailing an empty colon.
//   - a non-financial goal whose steps are all done (or which has none yet)
//     lands in the same place.
//
// Pure by design: no DB, no React. Same reason as lib/utils/adjustment-step.ts
// — this project has no component-testing library, so anything worth pinning
// has to live outside the component.

export type TodayStepCandidate = {
  id: string;
  title: string;
  isDone: boolean;
  /** "yyyy-MM-dd" or null. Comparable as a string precisely because it is a
   *  zero-padded ISO key — never wrap it in a Date to compare it. */
  dueDate: string | null;
};

export type TodayStep = { id: string; title: string; dueDate: string | null };

export type GoalKindForStep = "financial" | "non_financial";

/**
 * The day's step for the focus goal, or null when there isn't one.
 *
 * Rule (B2 default): the first open step with the nearest due date; on a tie,
 * checklist order. A step with no due date is not "due first" — it sorts after
 * every dated one, so a dated step always wins. When nothing is dated the list
 * order decides, which is the same answer a person reading their own checklist
 * top-down would give.
 *
 * `items` must arrive in checklist order (sortOrder, then createdAt — what
 * listChecklistItems already returns). The sort below is stable in every engine
 * this runs on, so that incoming order IS the tie-breaker; there is no second
 * sort key here on purpose.
 */
export function pickTodayStep(
  items: TodayStepCandidate[],
  goalKind: GoalKindForStep,
): TodayStep | null {
  if (goalKind === "financial") return null;

  const open = items.filter((item) => item.isDone === false);
  if (open.length === 0) return null;

  const [best] = [...open].sort((a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });

  return { id: best.id, title: best.title, dueDate: best.dueDate };
}

/** The caption rendered under «Как прошёл день?». Null means: draw no caption
 *  at all — not an empty line, not «Шаг на сегодня: —». */
export function todayStepCaption(step: TodayStep | null): string | null {
  return step ? `Шаг на сегодня: ${step.title}` : null;
}
