import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Two rules for posting through an AI assistant (2026-11-23, after the first
 * live test put the same video on YouTube twice under two titles):
 *
 * 1. A video already out, or on its way, on an account isn't posted there again
 *    unless the person clearly asks for a second copy. Checked when the post is
 *    prepared and again at confirmation, since it can be posted from My Sparks
 *    in between.
 * 2. The words in the preview are the words that post: they're saved on the
 *    prepared action, so nothing is chosen after the person has seen them.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** "failed" isn't here: a post that never went out can be tried again. */
export const LIVE_POST_STATUSES = ["posted", "posting", "scheduled"] as const;

export interface LivePost { platform: string; status: string; at: string | null }

/** Where this video already is. Null if that couldn't be checked: then nothing should post. */
export async function livePosts(admin: Admin, userId: string, videoId: string, platforms: string[]): Promise<LivePost[] | null> {
  if (!platforms.length) return [];
  const { data, error } = await admin
    .from("social_posts")
    .select("platform, post_status, posted_at, scheduled_at, created_at")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .in("platform", platforms)
    .in("post_status", [...LIVE_POST_STATUSES]);
  if (error) return null;
  const byPlatform = new Map<string, LivePost>();
  for (const r of (data ?? []) as { platform: string; post_status: string; posted_at: string | null; scheduled_at: string | null; created_at: string | null }[]) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, { platform: r.platform, status: r.post_status, at: r.posted_at ?? r.scheduled_at ?? r.created_at });
  }
  return Array.from(byPlatform.values());
}

/** "already posted to YouTube and scheduled on LinkedIn" */
export function liveSummary(posts: LivePost[], label: (platform: string) => string): string {
  const parts = posts.map((p) => `${p.status === "scheduled" ? "scheduled on" : p.status === "posting" ? "being posted to" : "posted to"} ${label(p.platform)}`);
  return `already ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? ""}`;
}

export interface PostProject {
  title?: string | null;
  ai_script?: Record<string, unknown> | null;
  seo_data?: Record<string, unknown> | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The Share Kit's words, in the order the rest of the app prefers them. */
export function postCopyFor(project: PostProject | null) {
  const ai = project?.ai_script ?? {};
  const seo = project?.seo_data ?? {};
  const title = (text(seo.youtube_title) || text(ai.title) || text(project?.title)).slice(0, 100);
  const description = text(seo.youtube_description) || text(ai.description) || title;
  const caption = text(seo.instagram_caption) || text(ai.hook) || title;
  const linkedin = text(seo.linkedin_post) || caption;
  return { title, description, caption, linkedin };
}

export type PostCopy = ReturnType<typeof postCopyFor>;

/** What one account will actually show, for the preview. */
export const previewFor = (platform: string, copy: PostCopy) => ({
  platform,
  title: copy.title,
  text: platform === "youtube" ? copy.description : platform === "linkedin" ? copy.linkedin : copy.caption,
});
