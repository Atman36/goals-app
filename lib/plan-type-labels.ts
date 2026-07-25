import type { IfThenPlan } from "@/lib/validators/checklist";

// Shared copy for if-then plan types (T5 Decisions #6) — neutral, no
// judgement on which type is "better". One place, like lib/checkin-labels.ts,
// rather than scattered across components.
//
// Note: components/goals/checklist-block.tsx has its OWN older copy of this
// same Record (different wording) for the manual "add checklist item" form —
// out of scope for T5 (Boundaries: that file isn't touched), so the two
// surfaces show different labels for the same planType until reconciled.
export const PLAN_TYPE_LABELS: Record<IfThenPlan["planType"], string> = {
  initiation: "Начать новое действие",
  maintenance: "Удержать то, что уже делаю",
  relapse_prevention: "План на случай срыва",
};
