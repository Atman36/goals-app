import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  cookieValueForToken,
  isGateEnabled,
  isValidCookie,
  isValidToken,
} from "@/lib/access";

// Manual entry point for the deployment token gate (proxy.ts). The usual way in
// is the one-click link `https://<host>/?access=<token>`; this page exists for
// typing the token by hand, and for the case where a browser rejected the cookie.

/** Only ever redirects inside this app: an attacker-controlled `next` must not
 *  become an open redirect to another origin. */
function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function unlock(formData: FormData) {
  "use server";

  // A Server Action is a public POST endpoint — it re-checks everything itself
  // (AGENTS.md) rather than trusting that proxy.ts let the request through.
  if (!isGateEnabled()) redirect("/");

  const token = formData.get("token");
  const next = safeNextPath(formData.get("next")?.toString());

  if (typeof token !== "string" || !isValidToken(token)) {
    redirect(`/unlock?error=1${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, cookieValueForToken(token.trim()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });

  redirect(next);
}

export default async function UnlockPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Nothing to unlock: either the gate is off, or this browser already holds a
  // valid cookie and landed here by typing the URL.
  if (!isGateEnabled()) redirect("/");
  const cookieStore = await cookies();
  if (isValidCookie(cookieStore.get(ACCESS_COOKIE)?.value)) redirect(next);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Доступ по ключу</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={unlock} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="token">Ключ доступа</Label>
              <Input
                id="token"
                name="token"
                type="password"
                autoComplete="off"
                autoFocus
                required
                aria-describedby={params.error ? "token-error" : undefined}
              />
              {params.error ? (
                <p id="token-error" role="alert" className="text-sm text-destructive">
                  Ключ не подошёл.
                </p>
              ) : null}
            </div>
            <Button type="submit">Войти</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
