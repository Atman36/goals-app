import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertUser } from "@/lib/db/queries/users";
import { isOwnerEmail } from "@/lib/owner";

// Google OAuth landing route — exchanges the PKCE `code` for a session, then
// enforces the owner allowlist (client-side signInWithOAuth can't check this
// up front). Non-owner accounts are signed back out immediately. PRD §3.8.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      const isOwner = isOwnerEmail(data.user.email);

      if (!isOwner) {
        await supabase.auth.signOut();
        redirect("/login?error=not_owner");
      }

      await upsertUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.full_name ?? null,
      });
      redirect("/");
    }
  }

  redirect("/login?error=auth");
}
