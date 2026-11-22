import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureVideoSrt } from "@/lib/utils/video-srt";
import { parseSrt, srtToPlainText } from "@/lib/utils/srt";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The words a project's video says: its script, or, when there's no real
 * script (Speak naturally, an uploaded clip), the transcript of its newest
 * finished video. ensureVideoSrt caches, so a transcription is paid once.
 *
 * Shared by the blog and Share Kit services (2026-11-22). It was written out
 * twice, once in each route.
 */
export async function spokenWords(
  admin: Admin,
  userId: string,
  projectId: string,
  script: Record<string, unknown>,
): Promise<string> {
  let spoken = String(script.script ?? "").trim();
  if (spoken.length < 200) {
    const { data: vid } = await admin
      .from("generated_videos")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("render_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const videoId = (vid as { id: string } | null)?.id;
    if (videoId) {
      const srt = await ensureVideoSrt(admin, userId, videoId);
      if (srt.ok) spoken = srtToPlainText(parseSrt(srt.srt)).trim();
    }
  }
  return spoken;
}
