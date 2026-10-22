import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, canonicalUrl } from "@/lib/seo/public-pages";

// Served at /sitemap.xml. /sitemap-index.xml 308s here (next.config.mjs).
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: canonicalUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
