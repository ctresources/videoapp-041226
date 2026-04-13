/**
 * HeyGen Studio Video API integration.
 *
 * Handles the complete video generation pipeline:
 *   1. Upload user photo → talking_photo_id (one-time, in settings)
 *   2. Upload audio asset (fallback for voice)
 *   3. Generate multi-scene video with avatar + voice + b-roll + captions
 *   4. Poll for completion → video URL
 *
 * Users never interact with HeyGen directly — everything goes through our app.
 * All generated content is Fair Housing compliant.
 */

const HEYGEN_API = "https://api.heygen.com";
const HEYGEN_UPLOAD = "https://upload.heygen.com";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY is not set. Add it in .env.local");
  return key;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoType = "blog_long" | "youtube_16x9" | "reel_9x16" | "short_1x1";

export const DIMENSIONS: Record<VideoType, { width: number; height: number }> = {
  blog_long:    { width: 1920, height: 1080 },
  youtube_16x9: { width: 1920, height: 1080 },
  reel_9x16:    { width: 1080, height: 1920 },
  short_1x1:    { width: 1080, height: 1080 },
};

export interface SceneInput {
  scriptText: string;
  /** Per-scene pre-uploaded ElevenLabs audio asset — required for cloned voices. */
  audioAssetId?: string;
  /** HeyGen-hosted video asset ID (from uploadVideoAsset) — preferred over url. */
  backgroundVideoAssetId?: string;
  backgroundVideoUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
}

export interface GenerateVideoParams {
  scenes: SceneInput[];
  talkingPhotoId: string;
  /** ElevenLabs voice_id — only works for HeyGen's own shared voices, not cloned voices. Use per-scene audioAssetId instead for cloned voices. */
  voiceId?: string;
  dimension: { width: number; height: number };
  title?: string;
  callbackUrl?: string;
}

export interface VideoStatus {
  status: "pending" | "waiting" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  captionUrl: string | null;
  duration: number | null;
  error: string | null;
}

// ─── 1. Upload Talking Photo (one-time, from settings) ───────────────────────

/**
 * Upload a user's headshot photo to HeyGen to create a talking photo avatar.
 * Uses the v2 two-step flow:
 *   Step 1: Upload image as asset → get image_key
 *   Step 2: Create photo avatar group → get group_id (used as talking_photo_id)
 *
 * Returns the group_id which is stored in the user's profile as heygen_photo_id.
 */
export async function uploadTalkingPhoto(
  imageBuffer: Buffer,
  contentType = "image/jpeg",
): Promise<string> {
  const apiKey = getApiKey();
  console.log(`[heygen] Step 1: Uploading image asset (${(imageBuffer.length / 1024).toFixed(0)} KB)...`);

  // ── Step 1: Upload image as asset ──────────────────────────────────────────
  const uploadRes = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": contentType,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => "unknown");
    throw new Error(`HeyGen image asset upload failed (${uploadRes.status}): ${err.slice(0, 300)}`);
  }

  const uploadData = await uploadRes.json();
  console.log("[heygen] Asset upload response:", JSON.stringify(uploadData).slice(0, 300));

  const imageKey = uploadData.data?.image_key;
  if (!imageKey) {
    throw new Error(`HeyGen returned no image_key. Response: ${JSON.stringify(uploadData).slice(0, 200)}`);
  }

  console.log(`[heygen] Image asset uploaded, image_key: ${imageKey}`);

  // ── Step 2: Create photo avatar group ──────────────────────────────────────
  console.log("[heygen] Step 2: Creating photo avatar group...");

  const groupRes = await fetch(`${HEYGEN_API}/v2/photo_avatar/avatar_group/create`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Avatar ${Date.now()}`,
      image_key: imageKey,
    }),
  });

  if (!groupRes.ok) {
    const err = await groupRes.text().catch(() => "unknown");
    throw new Error(`HeyGen avatar group creation failed (${groupRes.status}): ${err.slice(0, 300)}`);
  }

  const groupData = await groupRes.json();
  console.log("[heygen] Avatar group response:", JSON.stringify(groupData).slice(0, 300));

  const groupId = groupData.data?.group_id || groupData.data?.id;
  if (!groupId) {
    throw new Error(`HeyGen returned no group_id. Response: ${JSON.stringify(groupData).slice(0, 200)}`);
  }

  console.log(`[heygen] Talking photo avatar created: ${groupId}`);
  return groupId;
}

// ─── 2a. Upload Video Asset (for b-roll backgrounds) ────────────────────────

/**
 * Upload an MP4 video clip to HeyGen as an asset for use as a scene background.
 * External URLs (e.g. Pixabay) are not reliably rendered by HeyGen — the asset
 * must be uploaded to their system first.
 */
export async function uploadVideoAsset(videoBuffer: Buffer): Promise<string> {
  console.log(`[heygen] Uploading video asset (${(videoBuffer.length / 1024).toFixed(0)} KB)...`);

  const res = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "video/mp4",
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen video asset upload failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const id = data.data?.id;
  if (!id) throw new Error(`HeyGen returned no video asset id. Response: ${JSON.stringify(data).slice(0, 200)}`);

  console.log(`[heygen] Video asset uploaded: ${id}`);
  return id;
}

// ─── 2b. Upload Audio Asset (voice track for scenes) ────────────────────────

/**
 * Upload an MP3 audio file to HeyGen as an asset.
 * Used as fallback when ElevenLabs voice_id doesn't work directly in HeyGen.
 */
export async function uploadAudioAsset(audioBuffer: Buffer): Promise<string> {
  console.log(`[heygen] Uploading audio asset (${(audioBuffer.length / 1024).toFixed(0)} KB)...`);

  const res = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "audio/mpeg",
    },
    body: new Uint8Array(audioBuffer),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen audio upload failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const id = data.data?.id;
  if (!id) throw new Error("HeyGen returned no asset id");

  console.log(`[heygen] Audio asset uploaded: ${id}`);
  return id;
}

// ─── 3. Generate Multi-Scene Video (primary method) ──────────────────────────

/**
 * Generate a multi-scene video using HeyGen's Studio API.
 *
 * Each scene gets:
 *   - Talking photo avatar (circular PiP overlay)
 *   - Voice: either a pre-uploaded audio asset (preferred) or ElevenLabs voice_id
 *   - Background video (Pixabay b-roll) or solid color
 *
 * NOTE: HeyGen cannot access privately-cloned ElevenLabs voices. Always pass
 * `audioAssetId` (pre-generated and uploaded) rather than `voiceId`.
 *
 * Returns the HeyGen video_id for polling.
 */
export async function generateVideo(params: GenerateVideoParams): Promise<string> {
  const hasPerSceneAudio = params.scenes.every((s) => s.audioAssetId);
  if (!hasPerSceneAudio && !params.voiceId) {
    throw new Error("generateVideo requires either per-scene audioAssetId or a voiceId");
  }

  const videoInputs = params.scenes.map((scene) => {
    // Background: hosted video asset > external video url > image > color
    let background: Record<string, unknown>;
    if (scene.backgroundVideoAssetId) {
      background = {
        type: "video",
        video_asset_id: scene.backgroundVideoAssetId,
        play_style: "loop",
        fit: "cover",
      };
    } else if (scene.backgroundVideoUrl) {
      background = {
        type: "video",
        url: scene.backgroundVideoUrl,
        play_style: "loop",
        fit: "cover",
      };
    } else if (scene.backgroundImageUrl) {
      background = {
        type: "image",
        url: scene.backgroundImageUrl,
      };
    } else {
      background = {
        type: "color",
        value: scene.backgroundColor || "#0F172A",
      };
    }

    // Use pre-uploaded audio asset when available (cloned voices must go this route)
    const voice: Record<string, unknown> = scene.audioAssetId
      ? { type: "audio", audio_asset_id: scene.audioAssetId }
      : {
          type: "text",
          voice_id: params.voiceId,
          input_text: scene.scriptText,
          speed: 1.0,
        };

    return {
      character: {
        type: "talking_photo",
        talking_photo_id: params.talkingPhotoId,
        talking_photo_style: "circle",
        scale: 0.3,
        offset: { x: 0.35, y: 0.35 },
        matting: true,
      },
      voice,
      background,
    };
  });

  // caption only works with text-based voice; audio mode does not support it
  const body = {
    title: params.title || "Generated Video",
    caption: !hasPerSceneAudio,
    dimension: params.dimension,
    ...(params.callbackUrl && { callback_url: params.callbackUrl }),
    video_inputs: videoInputs,
  };

  console.log(`[heygen] Submitting ${videoInputs.length}-scene video to Studio API...`);
  console.log(`[heygen] Payload (first scene):`, JSON.stringify(videoInputs[0]).slice(0, 500));

  const bodyStr = JSON.stringify(body);
  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  const rawText = await res.text();
  console.log(`[heygen] Studio API response (${res.status}):`, rawText.slice(0, 600));

  if (!res.ok) {
    throw new Error(`HeyGen Studio API failed (${res.status}): ${rawText.slice(0, 500)}`);
  }

  const data = JSON.parse(rawText);
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error(`HeyGen returned no video_id. Full response: ${rawText.slice(0, 300)}`);

  console.log(`[heygen] Video submitted: ${videoId}`);
  return videoId;
}

// ─── 4. Fallback: Single-Scene with Pre-Made Audio ───────────────────────────

/**
 * Fallback when ElevenLabs voice_id doesn't work directly in HeyGen.
 * Uses pre-generated ElevenLabs audio uploaded as a HeyGen asset.
 */
export async function generateVideoWithAudio(params: {
  audioAssetId: string;
  talkingPhotoId: string;
  backgroundVideoAssetId?: string;
  backgroundVideoUrl?: string;
  dimension: { width: number; height: number };
  title?: string;
  callbackUrl?: string;
}): Promise<string> {
  let background: Record<string, unknown>;
  if (params.backgroundVideoAssetId) {
    background = {
      type: "video",
      video_asset_id: params.backgroundVideoAssetId,
      play_style: "loop",
      fit: "cover",
    };
  } else if (params.backgroundVideoUrl) {
    background = { type: "video", url: params.backgroundVideoUrl, play_style: "loop", fit: "cover" };
  } else {
    background = { type: "color", value: "#0F172A" };
  }

  const body = {
    title: params.title || "Generated Video",
    caption: false,  // caption only works with text-based voice
    dimension: params.dimension,
    ...(params.callbackUrl && { callback_url: params.callbackUrl }),
    video_inputs: [
      {
        character: {
          type: "talking_photo",
          talking_photo_id: params.talkingPhotoId,
          talking_photo_style: "circle",
          scale: 0.3,
          offset: { x: 0.35, y: 0.35 },
          matting: true,
        },
        voice: {
          type: "audio",
          audio_asset_id: params.audioAssetId,
        },
        background,
      },
    ],
  };

  console.log("[heygen] Submitting single-scene video (audio fallback)...");

  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen audio-mode video failed (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error("HeyGen returned no video_id");

  console.log(`[heygen] Audio-mode video submitted: ${videoId}`);
  return videoId;
}

// ─── 5. Poll for Completion ──────────────────────────────────────────────────

export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  const res = await fetch(
    `${HEYGEN_API}/v1/video_status.get?video_id=${videoId}`,
    { headers: { "x-api-key": getApiKey() } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen status check failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const d = json.data;

  // Normalize error — HeyGen sometimes returns an object, sometimes a string
  let errorMsg: string | null = null;
  if (d.error) {
    errorMsg = typeof d.error === "string" ? d.error : JSON.stringify(d.error);
  }

  return {
    status: d.status,
    videoUrl: d.video_url || null,
    thumbnailUrl: d.thumbnail_url || null,
    captionUrl: d.caption_url || null,
    duration: d.duration || null,
    error: errorMsg,
  };
}

/**
 * Poll HeyGen until the video is completed or fails.
 * Default: 5-minute timeout, poll every 10 seconds.
 */
export async function waitForVideo(
  videoId: string,
  timeoutMs = 300_000,
  intervalMs = 10_000,
): Promise<VideoStatus> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await getVideoStatus(videoId);
    console.log(`[heygen] Video ${videoId}: ${status.status}${status.duration ? ` (${status.duration}s)` : ""}`);

    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(`HeyGen video failed: ${status.error || "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`HeyGen video timed out after ${Math.round(timeoutMs / 1000)}s`);
}
