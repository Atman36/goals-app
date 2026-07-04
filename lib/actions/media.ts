"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_MEDIA, type AllowedMediaType } from "@/lib/storage";
import { insertMediaItem, countMediaForGoal } from "@/lib/db/queries/media";
import { updateGoal as updateGoalQuery } from "@/lib/db/queries/goals";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";
import {
  signedUploadSchema,
  registerMediaSchema,
  setGoalCoverSchema,
  type RegisterMediaInput,
} from "@/lib/validators/media";

const MAX_MEDIA_PER_GOAL = 50; // PRD §7

const EXT_BY_MIME: Record<AllowedMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type SignedUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

export type RegisterMediaResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: string };

/**
 * Mints a client-signed upload URL (no proxying through this server) for a
 * new media object. `goalId` is undefined while creating a goal (the cover
 * is picked before the goal exists) — the storage path falls back to
 * "unassigned" in that case; the mediaItems row itself is only ever inserted
 * later, once a real goalId exists (see registerMedia / lib/actions/goals.ts).
 */
export async function createSignedUpload(input: {
  goalId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<SignedUploadResult> {
  const requestId = crypto.randomUUID();
  const log = withRequestId(requestId);

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  const parsed = signedUploadSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "createSignedUpload: validation failed");
    if (parsed.error.issues.some((issue) => issue.path[0] === "fileSize")) {
      return { ok: false, error: "Файл больше 10 МБ" };
    }
    if (parsed.error.issues.some((issue) => issue.path[0] === "mimeType")) {
      return { ok: false, error: "Поддерживаются только JPG, PNG и WEBP" };
    }
    return { ok: false, error: "Некорректные данные" };
  }

  const ext = EXT_BY_MIME[parsed.data.mimeType];

  if (parsed.data.goalId) {
    const existingCount = await countMediaForGoal(user.id, parsed.data.goalId);
    if (existingCount >= MAX_MEDIA_PER_GOAL) {
      return { ok: false, error: "Не более 50 изображений на цель" };
    }
  }

  const path = `${user.id}/${parsed.data.goalId ?? "unassigned"}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_MEDIA).createSignedUploadUrl(path);

  if (error || !data) {
    log.error({ err: error, goalId: parsed.data.goalId }, "createSignedUpload: storage error");
    return { ok: false, error: "Не удалось подготовить загрузку" };
  }

  return { ok: true, path: data.path, token: data.token };
}

/**
 * Registers an already-uploaded object as a mediaItems row. Ownership is
 * enforced by insertMediaItem itself (userId-scoped); a goalId the caller
 * doesn't own simply fails to attach (returns null → typed error here).
 *
 * `commentId` (T8): when a comment attaches a photo, the row is linked to
 * BOTH the comment and the goal (goalId also passed) so it appears in the
 * goal's own gallery via listMediaByGoal, matching PRD §3.3 ("photo also
 * appears in goal gallery") without a second query.
 */
export async function registerMedia(input: RegisterMediaInput): Promise<RegisterMediaResult> {
  const requestId = crypto.randomUUID();
  const log = withRequestId(requestId);

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  const parsed = registerMediaSchema.safeParse(input);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "registerMedia: validation failed");
    return { ok: false, error: "Некорректные данные" };
  }

  // Every legitimate signed-upload path is minted as `${user.id}/...`
  // (see createSignedUpload) — a schema alone can't know the caller's
  // userId, so this rejects a client-supplied path outside the caller's own
  // storage prefix after parsing.
  if (!parsed.data.path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Некорректный путь файла" };
  }

  const media = await insertMediaItem(user.id, {
    goalId: parsed.data.goalId ?? null,
    commentId: parsed.data.commentId ?? null,
    storagePath: parsed.data.path,
    width: parsed.data.width ?? null,
    height: parsed.data.height ?? null,
    caption: parsed.data.caption ?? null,
  });

  if (!media) {
    return { ok: false, error: "Не удалось прикрепить изображение" };
  }

  if (parsed.data.setAsCover && parsed.data.goalId) {
    await updateGoalQuery(user.id, parsed.data.goalId, { coverImageId: media.id });
  }

  track({
    name: "media_uploaded",
    goal_id: parsed.data.goalId,
    context: parsed.data.commentId ? "comment" : parsed.data.setAsCover ? "cover" : "gallery",
  });
  log.info(
    { mediaId: media.id, goalId: parsed.data.goalId, commentId: parsed.data.commentId },
    "media registered",
  );

  if (parsed.data.goalId) {
    revalidatePath(`/goals/${parsed.data.goalId}`);
  }
  revalidatePath("/gallery");
  revalidatePath("/");

  return { ok: true, mediaId: media.id };
}

export type SetCoverResult = { ok: true } | { ok: false; error: string };

/**
 * Promotes an already-existing gallery image to be the goal's cover — T8's
 * "сделать обложкой" thumbnail action. Distinct from registerMedia's
 * setAsCover flag, which only covers the "just uploaded" case (it inserts a
 * new mediaItems row); this reuses the existing row's id via the same
 * updateGoal query registerMedia already calls, without duplicating it.
 */
export async function setGoalCover(goalId: string, mediaId: string): Promise<SetCoverResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  const parsed = setGoalCoverSchema.safeParse({ goalId, mediaId });
  if (!parsed.success) return { ok: false, error: "Некорректные данные" };

  const updated = await updateGoalQuery(user.id, parsed.data.goalId, { coverImageId: parsed.data.mediaId });
  if (!updated) return { ok: false, error: "Цель не найдена" };

  revalidatePath(`/goals/${parsed.data.goalId}`);
  revalidatePath("/");

  return { ok: true };
}
