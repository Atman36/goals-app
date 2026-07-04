import { getOrCreateOwner } from "@/lib/db/queries/users";
import type { User } from "@/lib/db/schema";

/**
 * Single-owner mode (T9): this app has exactly one user and no login — no
 * Supabase Auth session is involved. Always resolves to the same owner row
 * (see getOrCreateOwner), so it never returns null.
 */
export async function getCurrentUser(): Promise<User> {
  return getOrCreateOwner();
}
