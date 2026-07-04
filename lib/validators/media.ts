import { z } from "zod";

/** PRD §7 media limits: ≤10 MB/file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** PRD §7: jpg/png/webp. */
export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export const signedUploadSchema = z.object({
  goalId: z.uuid().optional(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  mimeType: z.enum(ALLOWED_MEDIA_TYPES),
});

export type SignedUploadInput = z.infer<typeof signedUploadSchema>;

export const registerMediaSchema = z.object({
  goalId: z.uuid().optional(),
  commentId: z.uuid().optional(),
  path: z.string().min(1).max(512),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  caption: z.string().max(2000).optional(),
  setAsCover: z.boolean().optional(),
});

export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;

export const setGoalCoverSchema = z.object({
  goalId: z.uuid(),
  mediaId: z.uuid(),
});

export type SetGoalCoverInput = z.infer<typeof setGoalCoverSchema>;
