import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/public-pages";

// Served at /robots.txt. The app pages already send signed-out visitors to
// /login, so only the API and the sign-in callbacks are kept out here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
