import { createClient } from "@/lib/supabase/server";
import {
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
} from "@/lib/validators/media";

/** Private bucket for all uploaded media. No live Supabase project is wired
 *  up yet (T6) — this is a name constant to code against; runtime bucket
 *  creation/config happens later. */
export const BUCKET_MEDIA = "media";

// Re-exported from lib/validators/media.ts (the pure-constants home — that
// file must stay importable from client components, so it can't depend on
// this server-only module) so every existing `from "@/lib/storage"` import
// site keeps working unchanged. MIME type is an allowlist string-compare on
// client-supplied metadata; byte-level/size enforcement lives in the
// Supabase bucket configuration (see README), not in this app code.
export { MAX_UPLOAD_BYTES, ALLOWED_MEDIA_TYPES, type AllowedMediaType };

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
