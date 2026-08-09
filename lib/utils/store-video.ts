import { createAdminClient } from "@/lib/supabase/admin";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";
import { compositePhotos, burnSubtitles } from "@/lib/utils/composite-photos";
import { transcribeToSrt } from "@/lib/utils/srt";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const BUCKET = "videos";

export interface StoreOptions {
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
  /**
   * Whether the user asked for captions. Defaults to on, matching the
   * "Burn synchronized captions" checkbox. When there is no sidecar SRT — the
   * Video Agent never produces one — the narration is transcribed and captions
   * are burned from that instead.
   */
  captionsEnabled?: boolean;
  /** An SRT already transcribed for this video, so a replay never pays twice. */
  cachedSrt?: string | null;
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

  /**
   * Upload and point the row at it.
   *
   * The processed write overwrites the SAME storage path as the raw one, so
   * without a changing URL the browser keeps showing whatever it cached first
   * — which is the raw render, before captions, b-roll or music. Captions were
   * reported missing on a video whose logs clearly showed them burned; the file
   * was correct and the player was serving a stale copy.
   *
   * `version` appends a cache-busting query so the finished video is fetched
   * fresh. Short cacheControl alone would not fix it: the stale copy is already
   * in the browser by the time post-processing finishes.
   */
  const store = async (buf: Buffer, version?: number): Promise<string> => {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "video/mp4", upsert: true, cacheControl: "60" });
    if (error) throw error;
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = version ? `${publicUrl}?v=${version}` : publicUrl;
    await admin.from("generated_videos").update({ video_url: url }).eq("id", videoId);
    return url;
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

    // Get the captions up front — they feed either the composite pass or the
    // standalone burn below.
    let srtPath: string | null = null;
    const { srt, transcribed } = await resolveCaptions(videoId, buffer, opts);
    if (srt) {
      await fs.mkdir(srtDir, { recursive: true });
      srtPath = join(srtDir, "captions.srt");
      await fs.writeFile(srtPath, srt, "utf8");
      // Cache a transcript so a later replay of this same video (the repair
      // path re-runs post-processing) never pays for transcription twice. The
      // .srt download endpoint reads the same key.
      if (transcribed) await mergeMetadata(admin, videoId, { srt });
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
      // New URL, so anyone already holding the raw copy refetches the finished one.
      publicUrl = await store(processed, Date.now());
      console.log(`[store-video] Re-stored processed ${videoId} → ${publicUrl}`);
    }
    // Marks this render as finished with post-processing, so the repair path
    // can tell "the webhook never got to it" from "already done" and stop
    // re-mixing music and re-burning captions into an already-processed video.
    await mergeMetadata(admin, videoId, { post_processed: true });
  } catch (err) {
    console.error("[store-video] Post-processing failed for", videoId, err instanceof Error ? err.message : err);
  } finally {
    await fs.rm(srtDir, { recursive: true, force: true }).catch(() => {});
  }

  return publicUrl;
}

/**
 * The captions to burn, if any.
 *
 * HeyGen's sidecar SRT is used when there is one — it is free and already
 * aligned. There is none on the Video Agent path: `caption` is a Direct Video
 * parameter, and asking the agent for captions in its prompt is a request it
 * is free to ignore, which is exactly what it did. So the fallback transcribes
 * the render's own narration.
 *
 * `transcribed` says whether the SRT is newly ours and therefore worth caching.
 */
async function resolveCaptions(
  videoId: string,
  video: Buffer,
  opts: StoreOptions,
): Promise<{ srt: string | null; transcribed: boolean }> {
  if (opts.captionsEnabled === false) return { srt: null, transcribed: false };

  if (opts.subtitleUrl) {
    try {
      const res = await fetch(opts.subtitleUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const srt = await res.text();
      // An empty SRT would make ffmpeg fail for no gain.
      if (srt.trim()) return { srt, transcribed: false };
    } catch (err) {
      console.warn(`[store-video] ${videoId}: subtitle fetch failed:`, err instanceof Error ? err.message : err);
    }
  }

  if (opts.cachedSrt?.trim()) return { srt: opts.cachedSrt, transcribed: false };

  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn(`[store-video] ${videoId}: no sidecar SRT and no ELEVENLABS_API_KEY — captions skipped`);
    return { srt: null, transcribed: false };
  }

  try {
    const srt = await transcribeToSrt(video);
    if (!srt) {
      console.warn(`[store-video] ${videoId}: no speech found, captions skipped`);
      return { srt: null, transcribed: false };
    }
    console.log(`[store-video] ${videoId}: transcribed captions (${srt.split("\n\n").length} cues)`);
    return { srt, transcribed: true };
  } catch (err) {
    console.warn(`[store-video] ${videoId}: transcription failed:`, err instanceof Error ? err.message : err);
    return { srt: null, transcribed: false };
  }
}

/** Merge keys into a video row's metadata without dropping what is already there. */
async function mergeMetadata(
  admin: ReturnType<typeof createAdminClient>,
  videoId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await admin
      .from("generated_videos")
      .select("metadata")
      .eq("id", videoId)
      .single();
    await admin
      .from("generated_videos")
      .update({ metadata: { ...((data?.metadata as Record<string, unknown> | null) ?? {}), ...patch } })
      .eq("id", videoId);
  } catch (err) {
    console.warn(`[store-video] ${videoId}: metadata update failed:`, err instanceof Error ? err.message : err);
  }
}

// isHeygenUrl / isExpiredHeygenUrl live in lib/utils/video-url.ts — they are
// imported by client components, and this module must stay server-only (the
// music mixer uses ffmpeg/child_process, which cannot be bundled for the browser).
