import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GoalWizard } from "@/components/goals/goal-wizard";

// PRD §3.2 step 0–1 only (self-concordance/WOOP/checklist wizard steps are
// Phase 2). Server Component: resolves the current user for the redirect
// gate and the default-currency prefill; the wizard's step state lives
// client-side in GoalWizard/GoalForm.
export default async function NewGoalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Новая цель</h1>
      <GoalWizard defaultCurrency={user.defaultCurrency} />
    </div>
  );
}
