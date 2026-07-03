"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { insertComment, softDeleteComment } from "@/lib/db/queries/comments";
import { registerMedia } from "@/lib/actions/media";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

const addCommentSchema = z.object({
  goalId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
  media: z
    .object({
      path: z.string().min(1),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

/**
 * Comments use the existing Server-Action + revalidatePath pattern (T8
 * decision), unlike contributions/checklist which go through /api/v1 with
 * TanStack Query. The optional photo reuses the upload path from
 * lib/actions/media.ts: the file is already uploaded client-side by the time
 * this runs (createSignedUpload → supabase upload), so this only needs to
 * register the mediaItems row once the comment itself exists.
 */
export async function addComment(input: AddCommentInput): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "addComment: validation failed");
    return { ok: false, error: "Проверьте поля формы" };
  }

  const comment = await insertComment(user.id, {
    goalId: parsed.data.goalId,
    body: parsed.data.body,
  });
  if (!comment) return { ok: false, error: "Цель не найдена" };

  if (parsed.data.media) {
    await registerMedia({
      goalId: parsed.data.goalId,
      commentId: comment.id,
      path: parsed.data.media.path,
      width: parsed.data.media.width,
      height: parsed.data.media.height,
    });
  }

  track({
    name: "comment_added",
    goal_id: parsed.data.goalId,
    has_media: !!parsed.data.media,
  });
  log.info({ goalId: parsed.data.goalId, commentId: comment.id }, "comment added");

  revalidatePath(`/goals/${parsed.data.goalId}`);

  return { ok: true };
}

export async function deleteComment(goalId: string, commentId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  await softDeleteComment(user.id, commentId);
  log.info({ goalId, commentId }, "comment soft-deleted");

  revalidatePath(`/goals/${goalId}`);

  return { ok: true };
}
