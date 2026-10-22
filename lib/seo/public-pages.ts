/**
 * The site's public, indexable pages, for the sitemap and canonical tags.
 *
 * www is the canonical host: Vercel 308s the apex to it. This is written out
 * rather than read from NEXT_PUBLIC_APP_URL, which still names the apex.
 *
 * Only pages a signed-out visitor can open belong here. Login, register and
 * the password pages are public but not worth indexing, and everything in
 * (dashboard) and (admin) redirects to /login.
 *
 * The feature pages, /pricing, /faq and /blog joined on 2026-10-22; blog
 * posts (/blog/<slug>) are public too and come from the blog_posts table.
 */
export const SITE_URL = "https://www.sparkreels.ai";

/** The feature pages, in Features-menu order. Their words are in lib/marketing/content.ts. */
export const FEATURE_PATHS = [
  "/ai-video-for-real-estate-agents",
  "/digital-twin",
  "/real-estate-teleprompter",
  "/real-estate-blog-writer",
  "/real-estate-content-autopilot",
  "/listing-video-generator",
] as const;

export const PUBLIC_PAGES = [
  "/",
  ...FEATURE_PATHS,
  "/pricing",
  "/faq",
  "/blog",
  "/beta",
  "/affiliates/apply",
  "/privacy",
  "/terms",
] as const;

export type PublicPage = (typeof PUBLIC_PAGES)[number];

export function canonicalUrl(path: PublicPage | `/blog/${string}`): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** Marketing pages a signed-out visitor may open, for middleware.ts. */
export function isPublicMarketingPath(pathname: string): boolean {
  return (PUBLIC_PAGES as readonly string[]).includes(pathname)
    || /^\/blog\/[a-z0-9]+(-[a-z0-9]+)*$/.test(pathname);
}
