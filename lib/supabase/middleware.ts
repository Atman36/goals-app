import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// allowlist of a single owner email — see PRD §3.8 (personal product, closed signup)
const ALLOWED_EMAIL = process.env.OWNER_EMAIL;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /auth/* covers the magic-link confirm + OAuth callback routes — they run
  // before a session exists (or before the owner check below), so they must
  // never be bounced back to /login themselves.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth");
  const isAllowed =
    !!user && (!ALLOWED_EMAIL || user.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase());

  if (!isAllowed && !isAuthRoute) {
    if (user) {
      // A non-owner session slipped past — sign them out, not just redirect,
      // so the stale cookie can't keep granting access on other routes.
      await supabase.auth.signOut();
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return supabaseResponse;
}
