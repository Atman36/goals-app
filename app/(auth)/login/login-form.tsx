"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: MagicLinkState = { status: "idle" };

const REDIRECT_ERROR_MESSAGES: Record<string, string> = {
  not_owner: "Вход только для владельца",
  auth: "Не удалось войти, попробуйте ещё раз",
};

export function LoginForm({ redirectError }: { redirectError?: string }) {
  const [state, formAction, isPending] = useActionState(sendMagicLink, initialState);

  async function handleGoogleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  const errorMessage =
    state.status === "error"
      ? state.message
      : redirectError
        ? REDIRECT_ERROR_MESSAGES[redirectError]
        : undefined;

  return (
    <>
      {state.status === "success" ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : (
        <form action={formAction} className="contents">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Почта</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Отправляем…" : "Получить ссылку"}
          </Button>
        </form>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        или
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" onClick={handleGoogleSignIn}>
        Войти через Google
      </Button>
    </>
  );
}
