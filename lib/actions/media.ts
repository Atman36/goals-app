"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET_MEDIA,
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
} from "@/lib/storage";
import { insertMediaItem, countMediaForGoal } from "@/lib/db/queries/media";
import { updateGoal as updateGoalQuery } from "@/lib/db/queries/goals";
import { track } from "@/lib/analytics/events";
import { withRequestId } from "@/lib/log";

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

  if (input.fileSize <= 0 || input.fileSize > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Файл больше 10 МБ" };
  }

  if (!ALLOWED_MEDIA_TYPES.includes(input.mimeType as AllowedMediaType)) {
    return { ok: false, error: "Поддерживаются только JPG, PNG и WEBP" };
  }
  const ext = EXT_BY_MIME[input.mimeType as AllowedMediaType];

  if (input.goalId) {
    const existingCount = await countMediaForGoal(user.id, input.goalId);
    if (existingCount >= MAX_MEDIA_PER_GOAL) {
      return { ok: false, error: "Не более 50 изображений на цель" };
    }
  }

  const path = `${user.id}/${input.goalId ?? "unassigned"}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_MEDIA).createSignedUploadUrl(path);

  if (error || !data) {
    log.error({ err: error, goalId: input.goalId }, "createSignedUpload: storage error");
    return { ok: false, error: "Не удалось подготовить загрузку" };
  }

  return { ok: true, path: data.path, token: data.token };
}

/**
 * Registers an already-uploaded object as a mediaItems row. Ownership is
 * enforced by insertMediaItem itself (userId-scoped); a goalId the caller
 * doesn't own simply fails to attach (returns null → typed error here).
 */
export async function registerMedia(input: {
  goalId?: string;
  path: string;
  width?: number;
  height?: number;
  caption?: string;
  setAsCover?: boolean;
}): Promise<RegisterMediaResult> {
  const requestId = crypto.randomUUID();
  const log = withRequestId(requestId);

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Не авторизовано" };

  const media = await insertMediaItem(user.id, {
    goalId: input.goalId ?? null,
    commentId: null,
    storagePath: input.path,
    width: input.width ?? null,
    height: input.height ?? null,
    caption: input.caption ?? null,
  });

  if (!media) {
    return { ok: false, error: "Не удалось прикрепить изображение" };
  }

  if (input.setAsCover && input.goalId) {
    await updateGoalQuery(user.id, input.goalId, { coverImageId: media.id });
  }

  track({
    name: "media_uploaded",
    goal_id: input.goalId,
    context: input.setAsCover ? "cover" : "gallery",
  });
  log.info({ mediaId: media.id, goalId: input.goalId }, "media registered");

  if (input.goalId) {
    revalidatePath(`/goals/${input.goalId}`);
  }
  revalidatePath("/gallery");
  revalidatePath("/");

  return { ok: true, mediaId: media.id };
}
