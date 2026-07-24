import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_QUERY_PARAM,
  cookieValueForToken,
  isGateEnabled,
  isValidCookie,
  isValidToken,
} from "@/lib/access";

// Next.js 16: this file is `proxy.ts`, NOT `middleware.ts` — a middleware.ts file
// is silently ignored. Proxy runs on the Node.js runtime by default, so node:crypto
// inside lib/access.ts is available here.

/**
 * Token gate. Off unless APP_ACCESS_TOKEN is set — see lib/access.ts.
 *
 * Two ways in:
 *   1. a one-click link, `https://<host>/?access=<token>` — the token is consumed
 *      here, exchanged for a cookie, and stripped from the URL before the page
 *      renders, so it never reaches the browser history of the rendered page;
 *   2. the /unlock form, for typing it by hand.
 */
export function proxy(request: NextRequest) {
  if (!isGateEnabled()) return NextResponse.next();

  const { nextUrl } = request;
  const suppliedToken = nextUrl.searchParams.get(ACCESS_QUERY_PARAM);

  if (isValidToken(suppliedToken)) {
    const cleanUrl = new URL(nextUrl);
    cleanUrl.searchParams.delete(ACCESS_QUERY_PARAM);
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(ACCESS_COOKIE, cookieValueForToken(suppliedToken!.trim()), {
      httpOnly: true,
      sameSite: "lax",
      secure: nextUrl.protocol === "https:",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    return response;
  }

  if (isValidCookie(request.cookies.get(ACCESS_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (nextUrl.pathname === "/unlock") return NextResponse.next();

  // Everything else — pages and API routes alike — is refused. API routes get a
  // status, not a redirect, so a fetch fails loudly instead of parsing HTML.
  if (nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }

  const unlockUrl = new URL("/unlock", nextUrl);
  // Remember where the visitor was heading, so the form can return them there.
  if (nextUrl.pathname !== "/") unlockUrl.searchParams.set("next", nextUrl.pathname);
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  // Excluded: Next's own static output, the image optimizer, and the favicon —
  // gating those would break the unlock page's own styling.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
