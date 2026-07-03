import { createClient } from "@/lib/supabase/server";
import { getUserById } from "@/lib/db/queries/users";
import type { User } from "@/lib/db/schema";

/**
 * Server Component / Server Action only. Resolves the current app user by
 * joining the Supabase auth session with our `users` table. Returns null
 * when either the session or the app-side row is missing — callers must
 * treat that as "not authenticated" (see PRD §3.8 closed single-owner signup).
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  return getUserById(authUser.id);
}
