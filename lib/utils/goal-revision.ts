/** The content fields of a goal that a revision snapshots. `deadline` is a
 *  "yyyy-MM-dd" date-key string on both sides so it compares by calendar date,
 *  not by Date identity. */
export interface GoalContentSnapshot {
  title: string;
  description: string | null;
  deadline: string;
}

/** Normalize a description for equality: an unset field is null or "" (a
 *  cleared textarea) — both mean "no description", so they must not read as a
 *  change. */
function normalizeDescription(value: string | null): string {
  return value ?? "";
}

/** The subset of ["title","description","deadline"] whose values differ between
 *  the current goal (`prev`) and the incoming edit (`next`). Empty array = no
 *  content change, so no revision is recorded. Pure — unit-tested without a DB.
 *  Order is stable (title → description → deadline) so callers can render the
 *  changed-field list deterministically. */
export function diffGoalContent(prev: GoalContentSnapshot, next: GoalContentSnapshot): string[] {
  const changed: string[] = [];
  if (prev.title !== next.title) changed.push("title");
  if (normalizeDescription(prev.description) !== normalizeDescription(next.description)) {
    changed.push("description");
  }
  if (prev.deadline !== next.deadline) changed.push("deadline");
  return changed;
}
