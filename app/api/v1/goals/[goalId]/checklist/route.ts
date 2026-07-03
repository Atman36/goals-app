import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getGoalWithDetails } from "@/lib/db/queries/goals";
import { listChecklistItems, insertChecklistItem } from "@/lib/db/queries/checklist";
import { checklistItemSchema } from "@/lib/validators/checklist";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { jsonData, jsonError } from "@/app/api/v1/_lib/serialize";

// Structured if-then form is Phase 2 (PRD facts, T8 spec) — MVP only accepts
// these 4 plain kinds from the client.
const MVP_KINDS = ["action", "document", "purchase", "agreement"] as const;

const postBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(MVP_KINDS).optional(),
  note: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  const log = withRequestId(crypto.randomUUID());
  const { goalId } = await params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Не авторизовано", 401);

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
  const { goalId } = await params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Не авторизовано", 401);

  const goal = await getGoalWithDetails(user.id, goalId);
  if (!goal) return jsonError("Цель не найдена", 404);

  const json = await request.json().catch(() => null);
  const bodyParsed = postBodySchema.safeParse(json);
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
  });
  if (!created) return jsonError("Цель не найдена", 404);

  track({ name: "checklist_item_added", goal_id: goalId, goal_kind: goal.kind, kind: created.kind });
  log.info({ goalId, itemId: created.id }, "checklist item added");

  return jsonData(created);
}
