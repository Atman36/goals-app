import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { softDeleteContribution } from "@/lib/db/queries/contributions";
import { withRequestId } from "@/lib/log";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

// softDeleteContribution (lib/db/queries/contributions.ts) is userId-scoped
// but doesn't resolve/return which goal a contribution belongs to, and this
// task may only *import* from lib/db/queries/** — so the client (which
// already knows the goal it's viewing) passes goalId, which also lets this
// route return the recalculated totals for that goal after the delete.
const querySchema = z.object({ goalId: z.uuid() });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ contributionId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { contributionId } = await params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Не авторизовано", 401);

  const { searchParams } = new URL(request.url);
  const parsedQuery = querySchema.safeParse({ goalId: searchParams.get("goalId") });
  if (!parsedQuery.success) return jsonError("Не указана цель", 400);

  const goal = await getGoalWithDetails(user.id, parsedQuery.data.goalId);
  if (!goal) return jsonError("Цель не найдена", 404);

  await softDeleteContribution(user.id, contributionId);

  const updatedGoal = await getGoalWithDetails(user.id, parsedQuery.data.goalId);
  log.info({ goalId: parsedQuery.data.goalId, contributionId }, "contribution soft-deleted");

  return jsonData({
    saved: updatedGoal?.saved ?? goal.saved,
    targetAmount: updatedGoal?.targetAmount ?? goal.targetAmount ?? null,
  });
}
