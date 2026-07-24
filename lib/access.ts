import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional token gate for deployed environments.
 *
 * The app runs in single-owner mode with no login (lib/auth.ts): every request is
 * served as the owner. That is fine locally, but a public URL then serves the
 * owner's goals, amounts and photos to anyone who has the link. This gate is the
 * cheap fix — one shared token, no accounts, no session store.
 *
 * It is DISABLED unless `APP_ACCESS_TOKEN` is set, so `npm run dev` needs no
 * configuration. Set it in the deployment's environment variables to turn the
 * gate on there and nowhere else.
 *
 * This is a deployment lock, not an authentication system. It proves possession
 * of one secret; it does not identify anybody. Real identity arrives in Stage 1.
 */
export const ACCESS_COOKIE = "ga_access";

/** Query parameter that carries the token in a shareable unlock link. */
export const ACCESS_QUERY_PARAM = "access";

/** How long an unlocked browser stays unlocked: 180 days, in seconds. */
export const ACCESS_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** The configured token, or null when the gate is switched off. */
export function configuredToken(): string | null {
  // Trimmed on purpose: a trailing newline pasted into a hosting provider's
  // environment editor is invisible and would otherwise reject every token.
  const raw = process.env.APP_ACCESS_TOKEN?.trim();
  return raw ? raw : null;
}

export function isGateEnabled(): boolean {
  return configuredToken() !== null;
}

/**
 * What a browser stores once unlocked: the digest, never the token itself, so
 * the secret is not sitting in the cookie jar ready to be copied into a URL.
 */
export function cookieValueForToken(token: string): string {
  return sha256(token).toString("hex");
}

/** Constant-time comparison — length is compared first because timingSafeEqual throws on a mismatch. */
function equals(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when `candidate` is the configured token. False when the gate is off. */
export function isValidToken(candidate: string | null | undefined): boolean {
  const expected = configuredToken();
  if (!expected || !candidate) return false;
  return equals(sha256(candidate.trim()), sha256(expected));
}

/** True when a request's cookie value proves an earlier successful unlock. */
export function isValidCookie(value: string | null | undefined): boolean {
  const expected = configuredToken();
  if (!expected || !value) return false;
  return equals(Buffer.from(value, "hex"), sha256(expected));
}
