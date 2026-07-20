// SERVER ONLY — service-role key; never import from a Client Component.
//
// This is enforced, not just documented (CR-034): `server-only` makes the
// build fail if this module is ever pulled into a client bundle. That guard
// matters here specifically because lib/supabase/client.ts — the PUBLIC anon
// client that "use client" components legitimately import — sits in this same
// directory, one autocomplete slip away.
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses bucket RLS, so storage operations
 * work in single-owner mode (T9 removed the user session — the anon/session
 * client can no longer satisfy the private `media` bucket's RLS). The
 * service-role key is server-only and must never reach a client bundle;
 * this module is imported exclusively by server code (see lib/storage.ts).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role env is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
