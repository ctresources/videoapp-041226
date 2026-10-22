import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The SparkReels blog's posts (2026-10-22), read on the server for the public
 * /blog pages and the sitemap. Only published rows ever leave here.
 */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic: string | null;
  cover_url: string | null;
  body_html: string;
  faqs: { q: string; a: string }[];
  author_name: string | null;
  word_count: number;
  published_at: string;
  updated_at: string;
}

type ListedPost = Omit<BlogPost, "body_html" | "faqs">;

const LISTED = "id, slug, title, description, topic, cover_url, author_name, word_count, published_at, updated_at";

export async function listPublishedPosts(limit = 100): Promise<ListedPost[]> {
  try {
    const { data } = await createAdminClient()
      .from("blog_posts")
      .select(LISTED)
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as ListedPost[];
  } catch {
    // The blog must never take a public page down with it.
    return [];
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const { data } = await createAdminClient()
      .from("blog_posts")
      .select(`${LISTED}, body_html, faqs`)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    return (data as BlogPost | null) ?? null;
  } catch {
    return null;
  }
}

/** About 230 words a minute, never under a minute. */
export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

export function postDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** A web address from a title: "AI Video Marketing for…" → "ai-video-marketing-for…". */
export function slugify(text: string): string {
  const full = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= 80) return full || "post";
  // Cut at a word, not inside one.
  const cut = full.slice(0, 81);
  return cut.slice(0, cut.lastIndexOf("-")) || full.slice(0, 80);
}
