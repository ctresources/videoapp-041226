/**
 * Where to send someone after they sign in, when they were on their way
 * somewhere specific: the AI connection consent page (2026-11-22) and the
 * link-account page (2026-11-25, linking another of their accounts).
 *
 * Only those two pages are allowed, and only as a path on this site: an
 * open "next" would let a link send people anywhere after signing in.
 */
export function consentReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^\/(oauth\/consent|link-account)(\?[A-Za-z0-9_\-=&%.]*)?$/.test(raw) ? raw : null;
}
