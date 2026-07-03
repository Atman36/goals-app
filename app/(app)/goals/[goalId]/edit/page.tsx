import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails, hasContributions } from "@/lib/db/queries/goals";
import { GoalForm } from "@/components/goals/goal-form";
import { GoalDangerActions } from "@/components/goals/goal-danger-actions";

export default async function EditGoalPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const { goalId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal) notFound();

  // Currency-lock (PRD §3.2): disable the currency control once the goal has
  // any non-deleted contribution. This is UI convenience only — updateGoal
  // enforces the same rule server-side regardless of what the client sends.
  const currencyLocked = goal.kind === "financial" ? await hasContributions(user.id, goalId) : false;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Редактирование цели</h1>
      <GoalForm mode="edit" goal={goal} currencyLocked={currencyLocked} />
      <GoalDangerActions goalId={goal.id} status={goal.status} />
    </div>
  );
}
