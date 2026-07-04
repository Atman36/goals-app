"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { insertComment, softDeleteComment } from "@/lib/db/queries/comments";
import { registerMedia } from "@/lib/actions/media";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import { addCommentSchema, deleteCommentSchema, type AddCommentInput } from "@/lib/validators/comment";

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

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

  const parsed = deleteCommentSchema.safeParse({ goalId, commentId });
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "deleteComment: validation failed");
    return { ok: false, error: "Проверьте поля формы" };
  }

  await softDeleteComment(user.id, parsed.data.commentId);
  log.info({ goalId: parsed.data.goalId, commentId: parsed.data.commentId }, "comment soft-deleted");

  revalidatePath(`/goals/${parsed.data.goalId}`);

  return { ok: true };
}
