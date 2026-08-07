import { createAdminClient } from "@/lib/supabase/admin";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";
import { compositePhotos, burnSubtitles } from "@/lib/utils/composite-photos";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const BUCKET = "videos";

interface StoreOptions {
  musicUrl?: string | null;
  /** Photos to composite as b-roll behind the avatar (Direct Video renders). */
  photoUrls?: string[] | null;
  /**
   * Stock footage to use as b-roll when the user supplied no photos of their
   * own. Only consulted if photoUrls is empty — the user's own photos always
   * win over stock.
   */
  clipUrls?: string[] | null;
  /** Target frame size, needed for photo compositing. */
  dimension?: { width: number; height: number } | null;
  /**
   * HeyGen's sidecar SRT. We burn captions ourselves because HeyGen's own
   * burn-in has no font size control and renders too small to read on a phone.
   */
  subtitleUrl?: string | null;
}

/**
 * Download a video from a temporary URL (e.g. HeyGen signed URL) and upload
 * it to Supabase Storage so it never expires. Updates the generated_videos row.
 *
 * Order matters. The raw render is stored and committed to the DB FIRST, then
 * post-processing runs and overwrites it in place. Post-processing used to come
 * first, which meant an ffmpeg step that ran past the function's 300s limit
 * killed the upload too — the row kept HeyGen's signed URL and the render was
 * eventually lost to link expiry. Storing first turns that worst case into a
 * merely-unpolished video at a permanent URL.
 *
 * Optional post-processing (each falls back to the already-stored video on
 * failure so a render is never lost):
 *   - photoUrls: composite the photos as background b-roll with the avatar as a
 *     corner PiP (Direct Video renders the avatar full-frame with no b-roll).
 *   - musicUrl: mix a music track under the voiceover.
 *
 * Returns the permanent public URL, or null if the video could not be stored
 * at all. Post-processing failures do NOT produce a null — the stored raw
 * render is still a good result.
 */
export async function downloadAndStoreVideo(
  sourceUrl: string,
  videoId: string,
  opts: StoreOptions = {},
): Promise<string | null> {
  const admin = createAdminClient();
  const path = `${videoId}.mp4`;

  const store = async (buf: Buffer): Promise<string> => {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
    await admin.from("generated_videos").update({ video_url: publicUrl }).eq("id", videoId);
    return publicUrl;
  };

  let buffer: Buffer;
  let publicUrl: string;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    publicUrl = await store(buffer);
    console.log(`[store-video] Stored raw ${videoId} → ${publicUrl}`);
  } catch (err) {
    console.error("[store-video] Failed for", videoId, err instanceof Error ? err.message : err);
    return null;
  }

  // ── Post-processing ───────────────────────────────────────────────────────
  // Beyond this point the video is already safe at `publicUrl`. Anything that
  // fails here is logged and skipped; the same path is overwritten on success
  // so the URL the rest of the app holds never changes.
  const srtDir = join(tmpdir(), `srt-${randomUUID()}`);
  try {
    let processed = buffer;
    let changed = false;

    // Fetch the sidecar SRT up front — it feeds either the composite pass or
    // the standalone burn below.
    let srtPath: string | null = null;
    if (opts.subtitleUrl) {
      try {
        const srtRes = await fetch(opts.subtitleUrl);
        if (!srtRes.ok) throw new Error(`HTTP ${srtRes.status}`);
        const srt = await srtRes.text();
        // An empty SRT would make ffmpeg fail for no gain.
        if (srt.trim()) {
          await fs.mkdir(srtDir, { recursive: true });
          srtPath = join(srtDir, "captions.srt");
          await fs.writeFile(srtPath, srt, "utf8");
        }
      } catch (err) {
        console.warn(`[store-video] ${videoId}: subtitle fetch failed:`, err instanceof Error ? err.message : err);
      }
    }

    // B-roll first (rebuilds the video frame), then music (mixes the audio).
    // The user's own photos take precedence; stock footage only fills the gap
    // when they supplied none.
    const broll = opts.photoUrls?.length
      ? { urls: opts.photoUrls, kind: "photo" as const }
      : opts.clipUrls?.length
        ? { urls: opts.clipUrls, kind: "clip" as const }
        : null;

    if (broll && opts.dimension) {
      // Captions ride along in pass 2 — that pass re-encodes every frame
      // regardless, so burning them there costs essentially nothing.
      const withBroll = await compositePhotos(
        processed, broll.urls, opts.dimension.width, opts.dimension.height, broll.kind, srtPath,
      );
      if (withBroll) { processed = withBroll; changed = true; }
      else console.warn(`[store-video] ${videoId}: b-roll compositing skipped, keeping plain avatar video`);
    } else if (srtPath && opts.dimension) {
      // No b-roll, so nothing else re-encodes this video — captions have to pay
      // for a pass of their own here.
      const withSubs = await burnSubtitles(processed, srtPath, opts.dimension.width, opts.dimension.height);
      if (withSubs) { processed = withSubs; changed = true; }
    }
    if (opts.musicUrl) {
      const mixed = await mixBackgroundMusic(processed, opts.musicUrl);
      if (mixed) { processed = mixed; changed = true; }
    }

    if (changed) {
      await store(processed);
      console.log(`[store-video] Re-stored processed ${videoId} → ${publicUrl}`);
    }
  } catch (err) {
    console.error("[store-video] Post-processing failed for", videoId, err instanceof Error ? err.message : err);
  } finally {
    await fs.rm(srtDir, { recursive: true, force: true }).catch(() => {});
  }

  return publicUrl;
}

// isHeygenUrl / isExpiredHeygenUrl live in lib/utils/video-url.ts — they are
// imported by client components, and this module must stay server-only (the
// music mixer uses ffmpeg/child_process, which cannot be bundled for the browser).
