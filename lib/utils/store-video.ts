import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "videos";

/**
 * Download a video from a temporary URL (e.g. HeyGen signed URL) and upload
 * it to Supabase Storage so it never expires. Updates the generated_videos row.
 * Returns the permanent public URL, or null if any step fails (caller keeps the
 * original URL as fallback).
 */
export async function downloadAndStoreVideo(
  sourceUrl: string,
  videoId: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
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

/** Returns true if a HeyGen signed URL has passed its Expires timestamp. */
export function isExpiredHeygenUrl(url: string): boolean {
  const match = url.match(/[?&]Expires=(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) < Math.floor(Date.now() / 1000);
}

/** Returns true if the URL is a temporary HeyGen CDN URL (expired or not). */
export function isHeygenUrl(url: string): boolean {
  return url.includes("heygen.ai") || url.includes("heygen.com/aws");
}
