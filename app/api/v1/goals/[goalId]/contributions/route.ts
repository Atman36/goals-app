import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import {
  listContributions,
  insertContributionIdempotent,
  contributionPayloadsMatch,
} from "@/lib/db/queries/contributions";
import { contributionSchema, contributionPostBodySchema } from "@/lib/validators/contribution";
import { goalIdSchema } from "@/lib/validators/goal";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { amountMagnitudeBucket } from "@/lib/utils/money";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

/**
 * Stable machine-readable code for "this idempotency key is already bound to a
 * different payload". The client keys its recovery on this string, so it must not
 * change. Sent alongside the standard `error` envelope field.
 *
 * Not exported: Next.js route modules only allow handler/config exports. The client
 * copy lives in components/goals/quick-add-sheet.tsx and is pinned by tests/.
 */
const IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

function jsonConflict(message: string, code: string) {
  return NextResponse.json({ error: message, code }, { status: 409 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { goalId: rawGoalId } = await params;

  const user = await getCurrentUser();

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

  const attempted = {
    id: parsed.data.id,
    goalId: parsed.data.goalId,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    occurredAt: parsed.data.occurredAt,
  };

  const result = await insertContributionIdempotent(user.id, attempted);

  if (result.status === "goal_not_found") {
    // Raced with a delete between the ownership check above and the insert.
    return jsonError("Цель не найдена", 404);
  }

  if (result.status === "conflict") {
    // The client-generated id is already taken. Only a byte-identical payload is a
    // genuine retry of the same request; anything else is a reused key whose new data
    // would otherwise be silently discarded (CR-014). A key we cannot see in user
    // scope (another owner, deleted goal/row) is likewise never treated as a replay.
    if (!result.existing || !contributionPayloadsMatch(result.existing, attempted)) {
      log.warn(
        { goalId, contributionId: parsed.data.id, resolvable: Boolean(result.existing) },
        "contribution idempotency key reused with a different payload",
      );
      return jsonConflict(
        "Этот взнос уже был сохранён с другими данными. Обновите страницу и попробуйте ещё раз.",
        IDEMPOTENCY_KEY_REUSED,
      );
    }

    // Exact replay: return the row that was actually stored, so the client reconciles
    // against the truth rather than its own optimistic copy (PRD §3.3.1/§7).
    log.info({ goalId, contributionId: parsed.data.id }, "exact idempotent replay of contribution");
    return jsonData({ duplicate: true, contribution: result.existing });
  }

  const created = result.contribution;

  track({
    name: "contribution_added",
    goal_id: goalId,
    goal_kind: goal.kind,
    currency: goal.currency,
    // Bucketed in bigint (lib/utils/money.ts) — the previous
    // Math.abs(Number(magnitude))/100 rounded a large int8 amount before
    // classifying it, and briefly materialized the exact value (GA-014).
    amount_bucket: amountMagnitudeBucket(magnitude),
    is_preset: bodyParsed.data.isPreset,
    is_negative: bodyParsed.data.isNegative,
  });
  log.info({ goalId, contributionId: created.id }, "contribution created");

  return jsonData({ duplicate: false, contribution: created });
}
