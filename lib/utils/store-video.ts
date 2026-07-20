import { createAdminClient } from "@/lib/supabase/admin";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";

const BUCKET = "videos";

/**
 * Download a video from a temporary URL (e.g. HeyGen signed URL) and upload
 * it to Supabase Storage so it never expires. Updates the generated_videos row.
 * When musicUrl is given, the track is mixed under the voiceover first (the
 * Video Agent can't do this itself — it rejects audio attachments).
 * Returns the permanent public URL, or null if any step fails (caller keeps the
 * original URL as fallback).
 */
export async function downloadAndStoreVideo(
  sourceUrl: string,
  videoId: string,
  musicUrl?: string | null,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    let buffer: Buffer = Buffer.from(await res.arrayBuffer());

    if (musicUrl) {
      const mixed = await mixBackgroundMusic(buffer, musicUrl);
      if (mixed) buffer = mixed; // on mix failure, store the original render
    }

    const admin = createAdminClient();
    const path = `${videoId}.mp4`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: "video/mp4", upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);

    await admin
      .from("generated_videos")
      .update({ video_url: publicUrl })
      .eq("id", videoId);

    console.log(`[store-video] Stored ${videoId} → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error("[store-video] Failed for", videoId, err instanceof Error ? err.message : err);
    return null;
  }
}

// isHeygenUrl / isExpiredHeygenUrl live in lib/utils/video-url.ts — they are
// imported by client components, and this module must stay server-only (the
// music mixer uses ffmpeg/child_process, which cannot be bundled for the browser).
