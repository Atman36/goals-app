import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { upsertUser } from "@/lib/db/queries/users";
import { isOwnerEmail } from "@/lib/owner";
import { logger } from "@/lib/log";

// Magic-link landing route — verifies the `token_hash` Supabase put in the
// email link, then upserts the app-side users row. See PRD §3.8.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    logger.warn({ step: "confirm", reason: "missing token params" }, "magic link confirm failed");
    redirect("/login?error=link_invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    logger.error(
      { step: "verifyOtp", code: error.status ?? error.code, msg: error.message },
      "magic link verify failed",
    );
    redirect("/login?error=link_expired");
  }

  const user = data.user;
  if (!user?.email) {
    logger.warn({ step: "confirm", reason: "verifyOtp ok but missing user email" }, "magic link confirm failed");
    redirect("/login?error=link_invalid");
  }

  if (!isOwnerEmail(user.email)) {
    logger.warn({ step: "confirm", reason: "not owner" }, "magic link confirm rejected");
    await supabase.auth.signOut();
    redirect("/login?error=not_owner");
  }

  await upsertUser({
    id: user.id,
    email: user.email,
    name: user.user_metadata.full_name ?? null,
  });
  redirect("/");
}
