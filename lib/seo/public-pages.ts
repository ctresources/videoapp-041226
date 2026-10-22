/**
 * The site's public, indexable pages, for the sitemap and canonical tags.
 *
 * www is the canonical host: Vercel 308s the apex to it. This is written out
 * rather than read from NEXT_PUBLIC_APP_URL, which still names the apex.
 *
 * Only pages a signed-out visitor can open belong here. Login, register and
 * the password pages are public but not worth indexing, and everything in
 * (dashboard) and (admin) redirects to /login.
 */
export const SITE_URL = "https://www.sparkreels.ai";

export const PUBLIC_PAGES = ["/", "/beta", "/affiliates/apply", "/privacy", "/terms"] as const;

export type PublicPage = (typeof PUBLIC_PAGES)[number];

export function canonicalUrl(path: PublicPage): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}
