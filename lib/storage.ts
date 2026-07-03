import { createClient } from "@/lib/supabase/server";

/** Private bucket for all uploaded media. No live Supabase project is wired
 *  up yet (T6) — this is a name constant to code against; runtime bucket
 *  creation/config happens later. */
export const BUCKET_MEDIA = "media";

/** PRD §7 media limits: ≤10 MB/file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** PRD §7: jpg/png/webp, validated by magic bytes — not just extension. */
export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

const SIGNED_READ_URL_EXPIRY_SECONDS = 60 * 60; // 1h

/**
 * Server-only. The bucket is private, so display of a stored cover/gallery
 * image always goes through a short-lived signed READ url — never a public
 * URL. Returns null if the object doesn't exist / storage errors.
 */
export async function getSignedMediaUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_MEDIA)
    .createSignedUrl(storagePath, SIGNED_READ_URL_EXPIRY_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}
