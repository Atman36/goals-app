import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { upsertUser } from "@/lib/db/queries/users";

// Magic-link landing route — verifies the `token_hash` Supabase put in the
// email link, then upserts the app-side users row. See PRD §3.8.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (!error && data.user?.email) {
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
