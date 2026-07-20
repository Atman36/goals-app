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
 * The comment row and its optional photo are two separate writes (the photo
 * can only be registered once the comment id exists), so the photo can fail
 * on its own after the comment is safely stored. `warning` reports exactly
 * that partial outcome — the caller shows the comment as saved AND tells the
 * user the photo did not attach, instead of a blanket success (CR-019).
 */
export type AddCommentResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

/**
 * Comments use the existing Server-Action + revalidatePath pattern (T8
 * decision), unlike contributions/checklist which go through /api/v1 with
 * TanStack Query. The optional photo reuses the upload path from
 * lib/actions/media.ts: the file is already uploaded client-side by the time
 * this runs (createSignedUpload → supabase upload), so this only needs to
 * register the mediaItems row once the comment itself exists.
 */
export async function addComment(input: AddCommentInput): Promise<AddCommentResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

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

  let mediaAttached = false;
  let mediaError: string | undefined;

  if (parsed.data.media) {
    const registered = await registerMedia({
      goalId: parsed.data.goalId,
      commentId: comment.id,
      path: parsed.data.media.path,
      width: parsed.data.media.width,
      height: parsed.data.media.height,
    });
    mediaAttached = registered.ok;
    if (!registered.ok) {
      mediaError = registered.error;
      log.warn(
        { goalId: parsed.data.goalId, commentId: comment.id, err: registered.error },
        "addComment: photo could not be attached",
      );
    }
  }

  // has_media reflects what actually landed in the DB, not what the client
  // offered — otherwise a failed photo still reports as an illustrated comment.
  track({
    name: "comment_added",
    goal_id: parsed.data.goalId,
    has_media: mediaAttached,
  });
  log.info(
    { goalId: parsed.data.goalId, commentId: comment.id, hasMedia: mediaAttached },
    "comment added",
  );

  revalidatePath(`/goals/${parsed.data.goalId}`);

  if (mediaError) {
    return { ok: true, warning: `Комментарий сохранён, но фото не прикрепилось: ${mediaError}` };
  }

  return { ok: true };
}

export async function deleteComment(goalId: string, commentId: string): Promise<SimpleActionResult> {
  const log = withRequestId(crypto.randomUUID());

  const user = await getCurrentUser();

  const parsed = deleteCommentSchema.safeParse({ goalId, commentId });
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "deleteComment: validation failed");
    return { ok: false, error: "Проверьте поля формы" };
  }

  // The UPDATE is itself the ownership/existence check: no returned row means
  // nothing was deleted, so reporting ok here would be a lie (CR-033).
  const deleted = await softDeleteComment(user.id, parsed.data.commentId);
  if (!deleted) {
    log.warn(
      { goalId: parsed.data.goalId, commentId: parsed.data.commentId },
      "deleteComment: no matching comment",
    );
    return { ok: false, error: "Комментарий не найден" };
  }

  log.info({ goalId: parsed.data.goalId, commentId: parsed.data.commentId }, "comment soft-deleted");

  revalidatePath(`/goals/${parsed.data.goalId}`);

  return { ok: true };
}
