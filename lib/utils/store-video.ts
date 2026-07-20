import { createAdminClient } from "@/lib/supabase/admin";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";
import { compositePhotos } from "@/lib/utils/composite-photos";

const BUCKET = "videos";

interface StoreOptions {
  musicUrl?: string | null;
  /** Photos to composite as b-roll behind the avatar (Direct Video renders). */
  photoUrls?: string[] | null;
  /** Target frame size, needed for photo compositing. */
  dimension?: { width: number; height: number } | null;
}

/**
 * Download a video from a temporary URL (e.g. HeyGen signed URL) and upload
 * it to Supabase Storage so it never expires. Updates the generated_videos row.
 *
 * Optional post-processing (each falls back to the un-processed video on
 * failure so a render is never lost):
 *   - photoUrls: composite the photos as background b-roll with the avatar as a
 *     corner PiP (Direct Video renders the avatar full-frame with no b-roll).
 *   - musicUrl: mix a music track under the voiceover.
 *
 * Returns the permanent public URL, or null if any step fails.
 */
export async function downloadAndStoreVideo(
  sourceUrl: string,
  videoId: string,
  opts: StoreOptions = {},
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    let buffer: Buffer = Buffer.from(await res.arrayBuffer());

    // Photos first (rebuilds the video frame), then music (mixes the audio).
    if (opts.photoUrls?.length && opts.dimension) {
      const withPhotos = await compositePhotos(buffer, opts.photoUrls, opts.dimension.width, opts.dimension.height);
      if (withPhotos) buffer = withPhotos;
    }
    if (opts.musicUrl) {
      const mixed = await mixBackgroundMusic(buffer, opts.musicUrl);
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
