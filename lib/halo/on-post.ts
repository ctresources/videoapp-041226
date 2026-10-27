import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchText } from "@/lib/halo/site-reader";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Is each posted Halo video on its Halo post yet? (2026-10-26, the owner's
 * ask: both of hers were, and the cards still said to text Halo.)
 *
 * Reads each post's page and looks for the video: its YouTube id (any embed
 * or link form contains it) or the video file's own name. Found → on_halo_at,
 * and the card says "✓ On your Halo post". Only posted Halo videos from the
 * last 30 days that aren't marked yet. Never throws.
 */
export async function checkOnHaloPosts(admin: Admin, userId: string): Promise<number> {
  try {
    const { data } = await admin
      .from("autopilot_drafts")
      .select("id, source_url, video_id")
      .eq("user_id", userId)
      .eq("source", "halo")
      .in("status", ["scheduled", "posted"])
      .is("on_halo_at", null)
      .not("source_url", "is", null)
      .gte("slot_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    const drafts = ((data ?? []) as { id: string; source_url: string; video_id: string | null }[]).filter((d) => d.video_id);
    if (!drafts.length) return 0;

    const vids = drafts.map((d) => d.video_id as string);
    const [{ data: posts }, { data: files }] = await Promise.all([
      admin.from("social_posts").select("video_id, platform_post_id").eq("platform", "youtube").in("video_id", vids).not("platform_post_id", "is", null),
      admin.from("generated_videos").select("id, video_url").in("id", vids),
    ]);
    const yt = new Map(((posts ?? []) as { video_id: string; platform_post_id: string }[]).map((p) => [p.video_id, p.platform_post_id]));
    const file = new Map(((files ?? []) as { id: string; video_url: string | null }[]).map((f) => [f.id, f.video_url]));

    let found = 0;
    for (const d of drafts) {
      const marks = [yt.get(d.video_id as string), file.get(d.video_id as string)?.split("?")[0].split("/").pop()]
        .filter((m): m is string => !!m && m.length >= 8);
      if (!marks.length) continue;
      const page = await fetchText(d.source_url);
      if (!page.ok || !page.text) continue;
      if (marks.some((m) => page.text.includes(m))) {
        await admin.from("autopilot_drafts").update({ on_halo_at: new Date().toISOString() }).eq("id", d.id);
        found++;
      }
    }
    return found;
  } catch (err) {
    console.error("[halo] on-post check:", err instanceof Error ? err.message : err);
    return 0;
  }
}
