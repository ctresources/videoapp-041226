import { waitUntil } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendVideoReadyEmail } from "@/lib/email";

const APP = "https://www.sparkreels.ai";
/** How long Sparklee's in-app pop-up gets to show it before the email goes. */
const EMAIL_AFTER_MS = 2 * 60 * 1000;

/**
 * A video just finished (2026-10-26, usability sweep #9).
 *
 * Claimed once, whichever path saw it finish first (webhook, status poll,
 * scenes build): the claim sets ready_notified_at, which is what Sparklee's
 * in-app pop-up looks for. Two minutes later, if the pop-up never showed it
 * (ready_seen_at still empty), the "Your video is ready" email goes instead.
 *
 * Never throws: a missed notice must not touch the video itself.
 */
export async function announceVideoReady(admin: SupabaseClient, videoId: string): Promise<void> {
  try {
    const { data: claimed } = await admin
      .from("generated_videos")
      .update({ ready_notified_at: new Date().toISOString() })
      .eq("id", videoId)
      .eq("render_status", "completed")
      .is("ready_notified_at", null)
      .select("id, user_id, project_id")
      .maybeSingle();
    const row = claimed as { id: string; user_id: string | null; project_id: string | null } | null;
    if (!row?.user_id) return;

    waitUntil((async () => {
      await new Promise((r) => setTimeout(r, EMAIL_AFTER_MS));
      const { data: v } = await admin
        .from("generated_videos")
        .select("ready_seen_at")
        .eq("id", row.id)
        .maybeSingle();
      if ((v as { ready_seen_at: string | null } | null)?.ready_seen_at) return;
      const [{ data: p }, { data: proj }] = await Promise.all([
        admin.from("profiles").select("email, full_name").eq("id", row.user_id).maybeSingle(),
        row.project_id
          ? admin.from("projects").select("title").eq("id", row.project_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const prof = p as { email: string | null; full_name: string | null } | null;
      if (!prof?.email) return;
      await sendVideoReadyEmail({
        email: prof.email,
        name: prof.full_name,
        title: (proj as { title: string | null } | null)?.title ?? "Your video",
        url: `${APP}/videos?highlight=${row.id}`,
      });
    })().catch((err) => console.error("[ready-notice] email failed:", err instanceof Error ? err.message : err)));
  } catch (err) {
    console.error("[ready-notice] claim failed:", err instanceof Error ? err.message : err);
  }
}
