import { createClient } from "@/lib/supabase/client";

/**
 * The video_type that matches a recording's actual shape.
 *
 * save-camera-recording defaults to "reel_9x16" when the caller says nothing,
 * which is right for a phone and wrong for everything else: a 1920x1080 webcam
 * take, or a landscape clip run through the brander, was filed as a vertical
 * reel and then played back letterboxed inside a portrait frame. Nobody chose
 * that shape — it was the absence of a choice.
 *
 * Returns null when the dimensions aren't known, so the caller passes nothing
 * and the old default still applies rather than a guess.
 */
export function videoTypeForSize(
  size: { width: number; height: number } | null | undefined,
): "youtube_16x9" | "reel_9x16" | "short_1x1" | undefined {
  if (!size || !size.width || !size.height) return undefined;
  const ratio = size.width / size.height;
  // A little slack either side of square: 1080x1088 is a square video with
  // rounding on it, not a landscape one.
  if (ratio > 1.02) return "youtube_16x9";
  if (ratio < 0.98) return "reel_9x16";
  return "short_1x1";
}

/**
 * The file extension for a recorded VIDEO blob.
 *
 * Not `extensionForType` from recording-format — that one answers the same
 * question for audio, where mp4 means an `.m4a`. Calling it here would have
 * filed every MP4 camera take as an audio file.
 */
export function videoExtensionForType(type: string): string {
  return type.includes("mp4") ? "mp4" : "webm";
}

/**
 * Uploads a camera/teleprompter recording directly from the browser to
 * Supabase Storage via a signed URL, then registers it as a completed video.
 * Long recordings (10+ min ≈ 100–200 MB) far exceed the serverless
 * request-body limit, so the file must not pass through our API server.
 */
export async function uploadCameraRecording(
  blob: Blob,
  opts: {
    title?: string;
    projectId?: string;
    videoType?: string;
    /**
     * The recording's recovery id, stable across retries.
     *
     * Both halves of the save use it: the storage path is derived from it, so
     * a retry replaces its own file rather than leaving another behind, and
     * the save route returns the existing video for a key it has already
     * seen instead of creating a second one.
     */
    idempotencyKey?: string;
    /** What was read on camera. Used to write the description and hashtags —
     *  without it a camera video reaches My Content with nothing to post it. */
    script?: string;
    /** Opening line. Stands in for the description on an uploaded clip, which
     *  has no script to summarise — its words are still inside its audio. */
    hook?: string;
    /** The market this video is about, which is not always the agent's own. */
    city?: string;
    state?: string;
    /** The agent's sign-off, appended to the post copy verbatim. Not spoken —
     *  the end card is what carries the ask on screen. */
    cta?: string;
  } = {},
): Promise<{ videoId: string; title: string; projectId: string | null }> {
  const ext = videoExtensionForType(blob.type);

  const urlRes = await fetch("/api/video/camera-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext, key: opts.idempotencyKey }),
  });
  const urlData = await urlRes.json();
  if (!urlRes.ok) throw new Error(urlData.error || "Failed to prepare upload");

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .uploadToSignedUrl(urlData.path, urlData.token, blob, {
      contentType: blob.type || (ext === "mp4" ? "video/mp4" : "video/webm"),
    });
  if (uploadError) {
    // The upload happens browser→storage directly, so a failure here never
    // reaches our server logs — the recording just silently never appeared in
    // My Content. Surface the real reason, especially the size limit.
    const raw = uploadError.message || "";
    const sizeMb = Math.round(blob.size / 1024 / 1024);
    console.error(`[camera-upload] Upload failed (${sizeMb} MB):`, raw);
    if (/maximum allowed size|too large|payload/i.test(raw)) {
      throw new Error(
        `Your recording is ${sizeMb} MB, which exceeds the storage upload limit. Record a shorter take, or raise the file size limit in Supabase → Storage → Settings.`,
      );
    }
    throw new Error(raw || "Upload failed");
  }

  const res = await fetch("/api/video/save-camera-recording", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath: urlData.path, ...opts }),
  });
  const data = await res.json();
  if (!res.ok) {
    // The gate's `code` is the difference between a toast someone can act on
    // and one they cannot, and throwing a bare Error threw it away. Attached
    // to the error so the recorder can offer the plan page.
    const err = new Error(data.error || "Failed to save video") as Error & { code?: string };
    if (data.code) err.code = data.code;
    throw err;
  }

  return {
    videoId: data.videoId as string,
    title: (data.title as string) || opts.title || "Camera Recording",
    // The project this recording belongs to, so the caller can offer the
    // Share Kit — the titles, description, hashtags and blog article that are
    // written for a camera video as much as for a rendered one.
    projectId: (data.projectId as string | undefined) ?? null,
  };
}
