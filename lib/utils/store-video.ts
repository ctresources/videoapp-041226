import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStatus, getRemainingQuota, creditsToUsd } from "@/lib/api/heygen";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";
import { compositePhotos, burnSubtitles } from "@/lib/utils/composite-photos";
import { ensureFaststart } from "@/lib/utils/faststart";
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
   * HeyGen's id for this render, so the sidecar SRT can be asked for again.
   * It is not ready when the video-ready webhook fires — measured at ~12s
   * later — and that single early miss was why captions silently never
   * appeared on Direct Video renders.
   */
  heygenVideoId?: string | null;
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

  // The webhook, the status poll and refresh-url all land here, and all three
  // can fire for the same render within seconds. Unclaimed, they each ran the
  // full job: one video was measured compositing the same 6 photos for 225s
  // twice, both writing this storage path and racing to stamp video_url.
  // Whoever claims first does the work; the rest take the stored URL and go.
  const { data: claimed } = await admin.rpc("claim_video_post_processing", { p_video_id: videoId });
  if (claimed !== true) {
    const { data: row } = await admin
      .from("generated_videos")
      .select("video_url")
      .eq("id", videoId)
      .single();
    console.log(`[store-video] ${videoId}: already claimed or finished, skipping`);
    return (row?.video_url as string | null) ?? null;
  }

  /**
   * Upload to storage and hand back the URL — without pointing the row at it.
   *
   * Publishing is deliberately deferred to a single write at the end. The raw
   * render used to be published the moment it landed, roughly four minutes
   * before compositing finished, so the app showed a finished-looking video
   * that was a bare talking head with no b-roll, music or captions. Watched in
   * that window it reads as a failed render.
   *
   * The processed write overwrites the SAME storage path as the raw one, so
   * without a changing URL the browser keeps showing whatever it cached first.
   * `version` appends a cache-busting query so the finished video is fetched
   * fresh; a short cacheControl alone would not fix it, because the stale copy
   * is already in the browser by the time post-processing finishes.
   */
  const store = async (buf: Buffer, version?: number): Promise<string> => {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "video/mp4", upsert: true, cacheControl: "60" });
    if (error) throw error;
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
    return version ? `${publicUrl}?v=${version}` : publicUrl;
  };

  const publish = async (url: string) => {
    await admin.from("generated_videos").update({ video_url: url }).eq("id", videoId);
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
  // The bytes are already safe in storage at this point; only the row still
  // needs pointing at them, which happens once at the very end. Anything that
  // fails here is logged and skipped, and the raw render gets published in its
  // place rather than the row being left with nothing.
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
    } else if (opts.captionsEnabled !== false) {
      // The user asked for captions and is getting none. Every branch that
      // gives up above logs its own reason; this line is what makes the
      // outcome searchable, because the failure is otherwise invisible in the
      // finished video until someone watches it.
      console.warn(`[store-video] ${videoId}: captions were requested but none were produced`);
    }

    // B-roll first (rebuilds the video frame), then music (mixes the audio).
    // The user's own photos take precedence; stock footage only fills the gap
    // when they supplied none.
    // Photos first, then stock. Stock used to be an either/or fallback, so six
    // photos under a three-minute script looped every 24 seconds with nothing
    // able to break it up. Appending clips lengthens and varies the sequence;
    // the user's own photos still lead.
    const broll = [
      ...(opts.photoUrls ?? []).map((url) => ({ url, kind: "photo" as const })),
      ...(opts.clipUrls ?? []).map((url) => ({ url, kind: "clip" as const })),
    ];

    let brollApplied = false;
    if (broll.length > 0 && opts.dimension) {
      // Captions ride along in pass 2 — that pass re-encodes every frame
      // regardless, so burning them there costs essentially nothing.
      const withBroll = await compositePhotos(
        processed, broll, opts.dimension.width, opts.dimension.height, srtPath,
      );
      if (withBroll) { processed = withBroll; changed = true; brollApplied = true; }
      else console.warn(`[store-video] ${videoId}: b-roll compositing skipped, keeping plain avatar video`);
    }

    // Captions only ride along when the b-roll pass actually ran. This was an
    // `else if` on "there is no b-roll", which meant a compositing FAILURE took
    // the captions down with it — one error costing the user two features, and
    // the video arriving as a bare talking head with no subtitles either. Keyed
    // on whether b-roll was applied, not on whether it was attempted.
    if (!brollApplied && srtPath && opts.dimension) {
      const withSubs = await burnSubtitles(processed, srtPath, opts.dimension.width, opts.dimension.height);
      if (withSubs) { processed = withSubs; changed = true; }
    }
    if (opts.musicUrl) {
      const mixed = await mixBackgroundMusic(processed, opts.musicUrl);
      if (mixed) { processed = mixed; changed = true; }
    }

    // Last in the chain, deliberately. Every pass above writes its own MP4 and
    // ffmpeg parks the index at the end unless told not to, so a faststart done
    // any earlier would be undone by the next step that touched the file.
    const fast = await ensureFaststart(processed, videoId);
    // Kept apart from `changed`, which means "post-processing produced
    // something that was asked for". A remux is repair work nobody requested,
    // and folding it in would silence the did-nothing warning below.
    const remuxed = fast !== processed;
    if (remuxed) processed = fast;

    if (changed || remuxed) {
      // New URL, so anyone already holding the raw copy refetches the finished one.
      publicUrl = await store(processed, Date.now());
      console.log(`[store-video] Re-stored ${videoId} (processed=${changed}, faststart=${remuxed}) → ${publicUrl}`);
    }
    // post_processed means "the pass ran to completion" — the repair path uses
    // it to avoid re-mixing music into an already-finished video. It does NOT
    // mean anything was produced, and it was previously the only thing
    // recorded: a render where every single step failed was stamped exactly
    // like one where they all worked, so the row reported success for a bare
    // talking head with no music and no captions. post_processing_applied
    // carries that distinction, and the error below makes the silent case
    // searchable — inputs were supplied and none of them landed.
    if (!changed && (broll.length > 0 || srtPath || opts.musicUrl)) {
      console.error(
        `[store-video] ${videoId}: post-processing produced NOTHING — ` +
        `b-roll=${broll.length}, captions=${srtPath ? "yes" : "no"}, music=${opts.musicUrl ? "yes" : "no"}. ` +
        `Video published as the raw avatar render.`,
      );
    }
    await mergeMetadata(admin, videoId, { post_processed: true, post_processing_applied: changed });
  } catch (err) {
    console.error("[store-video] Post-processing failed for", videoId, err instanceof Error ? err.message : err);
  } finally {
    await fs.rm(srtDir, { recursive: true, force: true }).catch(() => {});
  }

  // The one and only publish: the finished file if post-processing got there,
  // the raw render if it didn't. Until this line the row carries no video_url,
  // so nothing downstream can present a half-made video as ready to watch.
  await publish(publicUrl);

  /**
   * What the vendor actually charged for this render.
   *
   * Recorded here because this is the one place a finished render passes
   * through exactly once — the claim above makes sure of it, and the webhook,
   * the status poll and refresh-url all arrive at this same line.
   *
   * The delta is only trustworthy when renders do not overlap, so both raw
   * readings are kept rather than just the subtraction: two videos rendering
   * at once will attribute some of each other's cost, and that is recoverable
   * from the readings but not from a single number. Best effort throughout —
   * the video is published by the line above, and a balance reading is not
   * worth risking it.
   */
  try {
    const { data: row } = await admin
      .from("generated_videos")
      .select("metadata")
      .eq("id", videoId)
      .single();
    const meta = (row?.metadata as Record<string, unknown> | null) ?? {};
    const before = typeof meta.quota_before === "number" ? meta.quota_before : null;
    if (before !== null && meta.quota_after === undefined) {
      const { value: after } = await getRemainingQuota();
      if (after !== null) {
        const used = before - after;
        const credits = used >= 0 ? used : null;
        await mergeMetadata(admin, videoId, {
          quota_after: after,
          // Negative means the balance went UP mid-render — a top-up landed —
          // so the figure is meaningless rather than zero. Left null to say so.
          heygen_quota_used: credits,
          // Named an estimate because it is one: a conversion derived from a
          // single confirmed render, applied to a wallet that is charged at
          // different rates per engine. The credit count above is the fact.
          heygen_cost_usd_est: creditsToUsd(credits),
        });
        console.log(
          `[store-video] ${videoId}: HeyGen balance ${before} → ${after} ` +
          `(used ${used}${credits === null ? "" : `, ~$${creditsToUsd(credits)?.toFixed(2)}`})`,
        );
      }
    }
  } catch (err) {
    console.warn(`[store-video] ${videoId}: quota reading failed:`, err instanceof Error ? err.message : err);
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

  // The URL is asked for once when the video-ready webhook fires, and HeyGen
  // does not have it yet at that moment — it arrives about 12 seconds later.
  // Since we are about to spend minutes compositing, waiting a few seconds for
  // a free, perfectly aligned SRT is far cheaper than transcribing the audio
  // ourselves, and cheaper still than the silence this used to produce.
  const subtitleUrl = opts.subtitleUrl ?? (await waitForCaptionUrl(opts.heygenVideoId, videoId));

  if (subtitleUrl) {
    try {
      const res = await fetch(subtitleUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const srt = await res.text();
      // An empty SRT would make ffmpeg fail for no gain.
      if (srt.trim()) return { srt, transcribed: false };
      console.warn(`[store-video] ${videoId}: sidecar SRT was empty, falling back`);
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

/**
 * Waits for HeyGen to publish this render's sidecar SRT.
 *
 * Direct Video renders get one, but it trails the video-ready webhook by
 * roughly 12 seconds, so the single ask made when that webhook fires reliably
 * came back empty. Polling briefly costs a fraction of the compositing pass
 * that follows and saves a transcription call — but it is strictly best
 * effort: the caller falls back to transcribing when this gives up.
 */
async function waitForCaptionUrl(
  heygenVideoId: string | null | undefined,
  videoId: string,
  // Kept deliberately short. Compositing was measured at 225s against a 300s
  // function ceiling, so seconds spent here come straight out of the margin
  // that keeps a render from being killed mid-encode. The SRT was observed
  // landing ~12s after the video event, so 20s covers it with room to spare.
  attempts = 5,
  intervalMs = 4000,
): Promise<string | null> {
  if (!heygenVideoId) return null;
  const admin = createAdminClient();

  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    // The caption webhook may have landed in the meantime and cached it, which
    // is free to read and beats asking HeyGen again.
    try {
      const { data } = await admin
        .from("generated_videos")
        .select("metadata")
        .eq("id", videoId)
        .single();
      const cached = (data?.metadata as Record<string, unknown> | null)?.caption_url;
      if (typeof cached === "string" && cached) {
        console.log(`[store-video] ${videoId}: sidecar SRT arrived by webhook after ${((i + 1) * intervalMs) / 1000}s`);
        return cached;
      }
    } catch { /* fall through to asking HeyGen */ }

    try {
      const url = (await getVideoStatus(heygenVideoId)).captionUrl;
      if (url) {
        console.log(`[store-video] ${videoId}: sidecar SRT ready after ${((i + 1) * intervalMs) / 1000}s`);
        return url;
      }
    } catch (err) {
      console.warn(`[store-video] ${videoId}: caption poll failed:`, err instanceof Error ? err.message : err);
      return null; // A failing status endpoint won't start working in 20 seconds.
    }
  }
  console.warn(`[store-video] ${videoId}: no sidecar SRT after ${(attempts * intervalMs) / 1000}s — transcribing instead`);
  return null;
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
