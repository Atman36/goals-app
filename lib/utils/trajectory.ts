import { toDateKey, type DateKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { formatMoney } from "@/lib/utils/money";
import type { Currency } from "@/lib/validators/goal";

export type TrajectoryEventKind =
  | "created"
  | "contribution"
  | "step_done"
  | "comment"
  | "photo"
  | "revision"
  | "achieved";

export interface TrajectoryEvent {
  dateKey: DateKey;
  kind: TrajectoryEventKind;
  text: string;
  detail?: string;
}

export interface WeekCheckinSummary {
  total: number;
  done: number;
  partial: number;
  skipped: number;
  avgFeeling: number | null;
}

export interface TrajectoryWeek {
  weekStart: DateKey;
  events: TrajectoryEvent[];
  checkins: WeekCheckinSummary | null;
}

// RU labels for the revision event's changed-field list (Step 7).
const REVISION_FIELD_LABELS: Record<string, string> = {
  title: "название",
  description: "описание",
  deadline: "срок",
};

const COMMENT_DETAIL_MAX = 80;

/** Signed, currency-formatted contribution amount for the event text. Financial
 *  goals carry a currency; a non-financial goal should have no contributions, so
 *  a null currency falls back to a plain signed number (Step 7 guard) rather
 *  than formatting against a missing currency. */
function formatContribution(amount: bigint, currency: Currency | null): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const sign = negative ? "−" : "+";
  return `${sign}${currency ? formatMoney(abs, currency) : abs.toString()}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface CheckinAgg {
  done: number;
  partial: number;
  skipped: number;
  feelingSum: number;
  total: number;
}

/** Assembles a goal's path over time from already-loaded dated rows: one flat
 *  event stream grouped by ISO week (newest week first; within a week newest
 *  first by date, stable for same-day ties), plus one compact check-in summary
 *  per week (Decision 2). Weeks with neither an event nor a check-in are dropped
 *  (Decision 7 — no shame-empty rows). Pure — no DB, unit-tested. */
export function buildTrajectory(input: {
  goal: { title: string; createdAt: Date; achievedAt: Date | null; currency: Currency | null };
  contributions: { occurredAt: string; amount: bigint; note: string | null }[];
  steps: { title: string; isDone: boolean; doneAt: Date | null }[];
  comments: { body: string; createdAt: Date }[];
  media: { commentId: string | null; goalId: string | null; createdAt: Date }[];
  checkins: { date: string; outcome: "done" | "partial" | "skipped"; feeling: number }[];
  revisions: { title: string; description: string | null; deadline: string; changed: string[]; changedAt: Date }[];
}): TrajectoryWeek[] {
  const events: TrajectoryEvent[] = [];

  // Goal created — always present, so the creation week always renders.
  events.push({
    dateKey: toDateKey(input.goal.createdAt),
    kind: "created",
    text: "Цель поставлена",
    detail: input.goal.title,
  });

  for (const c of input.contributions) {
    events.push({
      dateKey: c.occurredAt,
      kind: "contribution",
      text: `Взнос ${formatContribution(c.amount, input.goal.currency)}`,
      detail: c.note ?? undefined,
    });
  }

  // Only completed steps land on the path (Decision 6); creating a step is
  // planning, not a step of the journey.
  for (const s of input.steps) {
    if (!s.isDone || !s.doneAt) continue;
    events.push({ dateKey: toDateKey(s.doneAt), kind: "step_done", text: "Шаг выполнен", detail: s.title });
  }

  for (const c of input.comments) {
    events.push({
      dateKey: toDateKey(c.createdAt),
      kind: "comment",
      text: "Комментарий",
      detail: truncate(c.body, COMMENT_DETAIL_MAX),
    });
  }

  // Decision 5: only gallery photos (attached to the goal, not to a comment)
  // become their own event — a comment-attached photo IS the comment event.
  for (const m of input.media) {
    if (m.commentId !== null || m.goalId === null) continue;
    events.push({ dateKey: toDateKey(m.createdAt), kind: "photo", text: "Фото добавлено" });
  }

  for (const r of input.revisions) {
    const fields = r.changed.map((f) => REVISION_FIELD_LABELS[f] ?? f).join(", ");
    events.push({
      dateKey: toDateKey(r.changedAt),
      kind: "revision",
      text: `Формулировка обновлена (${fields})`,
      detail: r.changed.includes("title") ? `Было: «${r.title}»` : undefined,
    });
  }

  if (input.goal.achievedAt) {
    events.push({ dateKey: toDateKey(input.goal.achievedAt), kind: "achieved", text: "Цель достигнута" });
  }

  // Group events by ISO week (input order preserved within each bucket).
  const weekEvents = new Map<DateKey, TrajectoryEvent[]>();
  for (const e of events) {
    const wk = weekStartKey(e.dateKey);
    const bucket = weekEvents.get(wk);
    if (bucket) bucket.push(e);
    else weekEvents.set(wk, [e]);
  }

  // Weekly check-in aggregation (Decision 2): daily check-ins would flood the
  // list, so each week shows one summary line instead.
  const weekCheckins = new Map<DateKey, CheckinAgg>();
  for (const c of input.checkins) {
    const wk = weekStartKey(c.date);
    const agg = weekCheckins.get(wk) ?? { done: 0, partial: 0, skipped: 0, feelingSum: 0, total: 0 };
    agg[c.outcome] += 1;
    agg.feelingSum += c.feeling;
    agg.total += 1;
    weekCheckins.set(wk, agg);
  }

  const weekStarts = new Set<DateKey>([...weekEvents.keys(), ...weekCheckins.keys()]);
  const weeks: TrajectoryWeek[] = [];
  for (const weekStart of weekStarts) {
    const evs = (weekEvents.get(weekStart) ?? []).slice();
    // Newest first by date; stable sort keeps input order for same-day ties.
    evs.sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0));

    const agg = weekCheckins.get(weekStart);
    weeks.push({
      weekStart,
      events: evs,
      checkins: agg
        ? {
            total: agg.total,
            done: agg.done,
            partial: agg.partial,
            skipped: agg.skipped,
            avgFeeling: agg.total > 0 ? Math.round((agg.feelingSum / agg.total) * 10) / 10 : null,
          }
        : null,
    });
  }

  // Newest week first.
  weeks.sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
  return weeks;
}
