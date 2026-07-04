import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { listContributions, insertContributionIdempotent } from "@/lib/db/queries/contributions";
import { contributionSchema, contributionPostBodySchema } from "@/lib/validators/contribution";
import { goalIdSchema } from "@/lib/validators/goal";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

function amountBucket(amountMajorAbs: number): "<1k" | "1k-10k" | ">10k" {
  if (amountMajorAbs < 1000) return "<1k";
  if (amountMajorAbs <= 10000) return "1k-10k";
  return ">10k";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { goalId: rawGoalId } = await params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Не авторизовано", 401);

  const goalIdParsed = goalIdSchema.safeParse(rawGoalId);
  if (!goalIdParsed.success) return jsonError("Некорректные данные", 400);
  const goalId = goalIdParsed.data;

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal) return jsonError("Цель не найдена", 404);

  const contributions = await listContributions(user.id, goalId);
  log.info({ goalId, count: contributions.length }, "contributions listed");

  return jsonData(contributions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { goalId: rawGoalId } = await params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Не авторизовано", 401);

  const goalIdParsed = goalIdSchema.safeParse(rawGoalId);
  if (!goalIdParsed.success) return jsonError("Некорректные данные", 400);
  const goalId = goalIdParsed.data;

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal) return jsonError("Цель не найдена", 404);

  if (goal.kind !== "financial" || !goal.currency) {
    return jsonError("Взносы доступны только для финансовых целей", 400);
  }

  const json = await request.json().catch(() => null);
  const bodyParsed = contributionPostBodySchema.safeParse(json);
  if (!bodyParsed.success) {
    log.warn({ issues: bodyParsed.error.issues }, "contribution POST: invalid body");
    return jsonError("Проверьте поля формы", 400);
  }

  const magnitude = BigInt(bodyParsed.data.amountMinor);
  const amount = bodyParsed.data.isNegative ? -magnitude : magnitude;

  const parsed = contributionSchema.safeParse({
    id: bodyParsed.data.id,
    goalId,
    amount,
    note: bodyParsed.data.note,
    occurredAt: bodyParsed.data.occurredAt,
  });
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "contribution POST: validation failed");
    return jsonError("Проверьте поля формы", 400);
  }

  const created = await insertContributionIdempotent(user.id, {
    id: parsed.data.id,
    goalId: parsed.data.goalId,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    occurredAt: parsed.data.occurredAt.toISOString().slice(0, 10),
  });

  if (!created) {
    // Goal ownership is already confirmed above, so a null result here can
    // only mean the client-generated id was already inserted — an idempotent
    // replay of a retried request, not an error (PRD §3.3.1/§7).
    log.info({ goalId, contributionId: parsed.data.id }, "duplicate contribution id — idempotent no-op");
    return jsonData({ duplicate: true, contribution: null });
  }

  const amountMajorAbs = Math.abs(Number(magnitude)) / 100;
  track({
    name: "contribution_added",
    goal_id: goalId,
    goal_kind: goal.kind,
    currency: goal.currency,
    amount_bucket: amountBucket(amountMajorAbs),
    is_preset: bodyParsed.data.isPreset,
    is_negative: bodyParsed.data.isNegative,
  });
  log.info({ goalId, contributionId: created.id }, "contribution created");

  return jsonData({ duplicate: false, contribution: created });
}
