import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails, hasContributions } from "@/lib/db/queries/goals";
import { getSignedMediaUrl } from "@/lib/storage";
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

  // Prefill the current cover so the upload control shows it instead of an
  // empty dropzone (T7b joins coverStoragePath; the private bucket needs a
  // signed read URL). Falls back to no preview if the cover is unset/errors —
  // never blocks rendering the form.
  const initialCoverUrl = goal.coverStoragePath
    ? ((await getSignedMediaUrl(goal.coverStoragePath).catch(() => null)) ?? undefined)
    : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Редактирование цели</h1>
      <GoalForm mode="edit" goal={goal} currencyLocked={currencyLocked} initialCoverUrl={initialCoverUrl} />
      <GoalDangerActions goalId={goal.id} status={goal.status} />
    </div>
  );
}
