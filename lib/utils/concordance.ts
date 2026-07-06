// Self-concordance check (PRD §3.2 Phase 2 methodology) — a soft signal that
// a goal is driven by guilt/external pressure rather than genuine interest,
// which the literature links to higher abandonment. Pure so it's unit-testable
// without pulling in the wizard/action wiring.
export type SelfConcordanceAnswers = {
  interest: number;
  values: number;
  guilt: number;
  externalPressure: number;
};

/** Dominance rule: warn when the "external" pair outweighs the "own" pair. */
export function isExternallyDriven(a: SelfConcordanceAnswers): boolean {
  return a.guilt + a.externalPressure > a.interest + a.values;
}
