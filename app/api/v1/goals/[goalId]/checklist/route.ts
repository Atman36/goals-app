import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { listChecklistItems, insertChecklistItem } from "@/lib/db/queries/checklist";
import { checklistItemSchema, checklistPostBodySchema } from "@/lib/validators/checklist";
import { goalIdSchema } from "@/lib/validators/goal";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

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

  const items = await listChecklistItems(user.id, goalId);
  log.info({ goalId, count: items.length }, "checklist items listed");

  return jsonData(items);
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

  const json = await request.json().catch(() => null);
  const bodyParsed = checklistPostBodySchema.safeParse(json);
  if (!bodyParsed.success) {
    log.warn({ issues: bodyParsed.error.issues }, "checklist POST: invalid body");
    return jsonError("Проверьте поля формы", 400);
  }

  const parsed = checklistItemSchema.safeParse({
    goalId,
    title: bodyParsed.data.title,
    note: bodyParsed.data.note,
    dueDate: bodyParsed.data.dueDate,
    kind: bodyParsed.data.kind ?? "action",
    ifThen: bodyParsed.data.ifThen,
  });
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "checklist POST: validation failed");
    return jsonError("Проверьте поля формы", 400);
  }

  const created = await insertChecklistItem(user.id, {
    goalId,
    title: parsed.data.title,
    note: parsed.data.note ?? null,
    dueDate: parsed.data.dueDate ? parsed.data.dueDate.toISOString().slice(0, 10) : null,
    kind: parsed.data.kind,
    ifThen: parsed.data.ifThen ?? null,
  });
  if (!created) return jsonError("Цель не найдена", 404);

  track({ name: "checklist_item_added", goal_id: goalId, goal_kind: goal.kind, kind: created.kind });
  log.info({ goalId, itemId: created.id }, "checklist item added");

  return jsonData(created);
}
