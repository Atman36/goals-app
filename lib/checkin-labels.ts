import type { CheckinOutcome } from "@/lib/validators/checkin";

// Shared copy for the daily check-in — the ONE source of the outcome/feeling
// wording (growth-reactor v5 §5 Decisions: non-shaming labels, text-only, never
// color). Neutral module (no "use client") so both the check-in card (a client
// component) and the trajectory summary (a server component) can import it
// without dragging a client boundary across.

/** Outcome labels, title-case as shown on the check-in buttons. */
export const OUTCOME_LABELS: Record<CheckinOutcome, string> = {
  done: "Сделал",
  partial: "Частично",
  skipped: "Не сегодня",
};

/** Feeling scale 1–5 labels («Тяжело» … «В потоке»). */
export const FEELING_LABELS: Record<number, string> = {
  1: "Тяжело",
  2: "Со скрипом",
  3: "Ровно",
  4: "Хорошо",
  5: "В потоке",
};
