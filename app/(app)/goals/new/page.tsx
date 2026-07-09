import { getCurrentUser } from "@/lib/auth";
import { GoalWizard } from "@/components/goals/goal-wizard";
import { TemplatePicker } from "@/components/goals/template-picker";
import { getTemplate } from "@/lib/goal-templates";

// PRD §3.2 step 0–1 only (self-concordance/WOOP/checklist wizard steps are
// Phase 2). Server Component: resolves the current user for the
// default-currency prefill; the wizard's step state lives client-side in
// GoalWizard/GoalForm.
//
// T5: `/goals/new` defaults to a template picker. `?template=<slug>` opens
// the wizard pre-filled from that template; `?custom=1` preserves today's
// blank-flow behavior.
export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; custom?: string }>;
}) {
  const user = await getCurrentUser();
  const { template: templateSlug, custom } = await searchParams;
  const template = templateSlug ? getTemplate(templateSlug) : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Новая цель</h1>
      {template ? (
        <GoalWizard defaultCurrency={user.defaultCurrency} template={template} />
      ) : custom ? (
        <GoalWizard defaultCurrency={user.defaultCurrency} />
      ) : (
        <TemplatePicker />
      )}
    </div>
  );
}
