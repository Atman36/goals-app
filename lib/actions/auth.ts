"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// PRD §3.8 — personal product, closed signup: magic links only ever go to the
// single owner. SITE_URL builds the redirect the confirm route lands on.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const emailSchema = z.email();

export type MagicLinkState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prevState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: "Не удалось войти, попробуйте ещё раз" };
  }
  const email = parsed.data;

  // Allowlist check happens BEFORE any Supabase call — strangers never receive
  // an email, they just get a generic rejection.
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail || email.toLowerCase() !== ownerEmail.toLowerCase()) {
    return { status: "error", message: "Вход только для владельца" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/confirm` },
  });

  if (error) {
    return { status: "error", message: "Не удалось войти, попробуйте ещё раз" };
  }

  return { status: "success", message: "Ссылка отправлена на почту" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
