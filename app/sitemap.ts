import type { MetadataRoute } from "next";
import { FEATURE_PATHS, PUBLIC_PAGES, canonicalUrl } from "@/lib/seo/public-pages";
import { listPublishedPosts } from "@/lib/blog/posts";

// Served at /sitemap.xml. /sitemap-index.xml 308s here (next.config.mjs).
// Re-read hourly so new blog posts show up; publishing refreshes it too.
export const revalidate = 3600;

const FEATURES = new Set<string>(FEATURE_PATHS);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map((path) => ({
    url: canonicalUrl(path),
    changeFrequency: path === "/" || path === "/blog" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : FEATURES.has(path) || path === "/pricing" ? 0.8 : 0.5,
  }));
  const posts = await listPublishedPosts(1000);
  return [
    ...pages,
    ...posts.map((p) => ({
      url: canonicalUrl(`/blog/${p.slug}`),
      lastModified: p.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
