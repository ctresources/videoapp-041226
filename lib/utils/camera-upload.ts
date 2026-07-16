import { createClient } from "@/lib/supabase/client";

/**
 * Uploads a camera/teleprompter recording directly from the browser to
 * Supabase Storage via a signed URL, then registers it as a completed video.
 * Long recordings (10+ min ≈ 100–200 MB) far exceed the serverless
 * request-body limit, so the file must not pass through our API server.
 */
export async function uploadCameraRecording(
  blob: Blob,
  opts: { title?: string; projectId?: string; videoType?: string } = {},
): Promise<{ videoId: string; title: string }> {
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";

  const urlRes = await fetch("/api/video/camera-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext }),
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
    // My Videos. Surface the real reason, especially the size limit.
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
  if (!res.ok) throw new Error(data.error || "Failed to save video");

  return { videoId: data.videoId as string, title: (data.title as string) || opts.title || "Camera Recording" };
}
