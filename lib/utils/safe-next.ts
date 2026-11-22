/**
 * Where to send someone after they sign in, when they were on their way
 * somewhere specific (2026-11-22, the AI connection consent page).
 *
 * Only the consent page is allowed, and only as a path on this site: an
 * open "next" would let a link send people anywhere after signing in.
 */
export function consentReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^\/oauth\/consent(\?[A-Za-z0-9_\-=&%.]*)?$/.test(raw) ? raw : null;
}
