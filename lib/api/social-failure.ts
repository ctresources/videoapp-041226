import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyPostFailed } from "@/lib/email";
import { partnerPlatform } from "@/lib/utils/social-platforms";

/**
 * What happens once a post is known to have failed after it was sent.
 *
 * The note in My Sparks needs nothing from here: it reads the failed rows.
 * This is the email, for the agent who is not looking at SparkReels at all.
 *
 * One email per platform per twelve hours. An expired connection fails every
 * post the same way, and five emails saying "reconnect Facebook" help no more
 * than one; the note in My Sparks still lists each post.
 *
 * Never throws. A failure to tell someone must not undo, or be mistaken for a
 * failure of, the thing that recorded the post's result.
 */
const QUIET_HOURS = 12;

export async function tellAboutFailure(admin: SupabaseClient, postId: string): Promise<void> {
  try {
    const { data } = await admin
      .from("social_posts")
      .select("id, user_id, platform, video_id, video_title, error_message, failure_emailed_at")
      .eq("id", postId)
      .maybeSingle();
    const row = data as {
      id: string; user_id: string; platform: string; video_id: string | null;
      video_title: string | null; error_message: string | null; failure_emailed_at: string | null;
    } | null;
    if (!row || row.failure_emailed_at) return;

    const since = new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("social_posts")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("platform", row.platform)
      .gte("failure_emailed_at", since)
      .limit(1);
    if ((recent ?? []).length > 0) return;

    const { data: who } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", row.user_id)
      .maybeSingle();
    const person = who as { email: string | null; full_name: string | null } | null;
    if (!person?.email) return;

    const sent = await notifyPostFailed({
      email: person.email,
      name: person.full_name,
      platform: partnerPlatform(row.platform)?.label ?? row.platform,
      title: row.video_title,
      reason: row.error_message,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai",
      photos: !row.video_id,
    });
    // Marked only when it really went, so a send that failed is not counted
    // as having told anyone.
    if (sent) {
      await admin.from("social_posts").update({ failure_emailed_at: new Date().toISOString() }).eq("id", row.id);
    }
  } catch (err) {
    console.error("[social] could not send the failed-post email:", err instanceof Error ? err.message : err);
  }
}
