/**
 * Single-owner allowlist. Fail-closed: unset/empty OWNER_EMAIL or missing
 * email means NOT owner — never invert this into `!ownerEmail || …`.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail || !email) return false;
  return email.toLowerCase() === ownerEmail.toLowerCase();
}
