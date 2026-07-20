import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { setChecklistItemDone, softDeleteChecklistItem } from "@/lib/db/queries/checklist";
import { checklistItemIdSchema, checklistPatchBodySchema } from "@/lib/validators/checklist";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { itemId: rawItemId } = await params;

  const user = await getCurrentUser();

  const itemIdParsed = checklistItemIdSchema.safeParse(rawItemId);
  if (!itemIdParsed.success) return jsonError("Некорректные данные", 400);
  const itemId = itemIdParsed.data;

  const json = await request.json().catch(() => null);
  const bodyParsed = checklistPatchBodySchema.safeParse(json);
  if (!bodyParsed.success) return jsonError("Проверьте поля формы", 400);

  const updated = await setChecklistItemDone(user.id, itemId, bodyParsed.data.isDone);
  if (!updated) return jsonError("Пункт не найден", 404);

  if (bodyParsed.data.isDone) {
    const goal = await getGoalWithDetails(user.id, updated.goalId);
    if (goal) {
      track({ name: "checklist_item_done", goal_id: updated.goalId, goal_kind: goal.kind });
    }
  }
  log.info({ itemId, isDone: bodyParsed.data.isDone }, "checklist item toggled");

  return jsonData(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { itemId: rawItemId } = await params;

  const user = await getCurrentUser();

  const itemIdParsed = checklistItemIdSchema.safeParse(rawItemId);
  if (!itemIdParsed.success) return jsonError("Некорректные данные", 400);
  const itemId = itemIdParsed.data;

  const deleted = await softDeleteChecklistItem(user.id, itemId);
  if (!deleted) return jsonError("Пункт не найден", 404);

  log.info({ itemId }, "checklist item soft-deleted");

  return jsonData({ ok: true });
}
