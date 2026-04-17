/**
 * HeyGen API integration — v3 primary, v2 legacy fallback.
 *
 * Primary pipeline (v3 Video Agent):
 *   1. Upload user photo → talking_photo_id via POST /v2/photo_avatar/avatar_group/create
 *   2. Upload assets via POST /v3/assets
 *   3. Submit Video Agent job via POST /v3/video-agents → session_id
 *   4. Two-step poll: GET /v3/video-agents/{session_id} → video_id → GET /v3/videos/{video_id}
 *
 * v2 legacy functions (generateVideo, generateVideoWithAudio) remain for rerenders
 * until a v3 equivalent of the multi-scene Studio API is available (flagged for
 * deprecation by October 31, 2026).
 *
 * Users never interact with HeyGen directly — everything goes through our app.
 * All generated content is Fair Housing compliant.
 */

const HEYGEN_API = "https://api.heygen.com";

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

  // ── Step 1: Upload image as asset (v3 endpoint) ───────────────────────────
  const uploadRes = await fetch(`${HEYGEN_API}/v3/assets`, {
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

  // v3 returns asset_id; v2 photo avatar group creation still uses image_key
  const imageKey = uploadData.data?.image_key || uploadData.data?.asset_id;
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
 * Upload an MP4 video clip to HeyGen as an asset (v3 endpoint).
 * Returns the asset_id for use in v2 scene backgrounds or v3 file references.
 */
export async function uploadVideoAsset(videoBuffer: Buffer): Promise<string> {
  console.log(`[heygen] Uploading video asset (${(videoBuffer.length / 1024).toFixed(0)} KB)...`);

  const res = await fetch(`${HEYGEN_API}/v3/assets`, {
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
  const id = data.data?.asset_id || data.data?.id;
  if (!id) throw new Error(`HeyGen returned no video asset id. Response: ${JSON.stringify(data).slice(0, 200)}`);

  console.log(`[heygen] Video asset uploaded: ${id}`);
  return id;
}

// ─── 2b. Upload Audio Asset (voice track for scenes) ────────────────────────

/**
 * Upload an MP3 audio file to HeyGen as an asset (v3 endpoint).
 * Used by legacy v2 multi-scene generation for per-scene voice tracks.
 */
export async function uploadAudioAsset(audioBuffer: Buffer): Promise<string> {
  console.log(`[heygen] Uploading audio asset (${(audioBuffer.length / 1024).toFixed(0)} KB)...`);

  const res = await fetch(`${HEYGEN_API}/v3/assets`, {
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
  const id = data.data?.asset_id || data.data?.id;
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

/**
 * Get video status via GET /v3/videos/{id}.
 * Replaces the deprecated GET /v1/video_status.get endpoint.
 * Used for both legacy v2-generated videos and v3 direct video jobs.
 */
export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
  const res = await fetch(
    `${HEYGEN_API}/v3/videos/${videoId}`,
    { headers: { "x-api-key": getApiKey() } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen status check failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const d = json.data;

  // v3 uses failure_code + failure_message for render errors
  let errorMsg: string | null = null;
  if (d.failure_message) {
    errorMsg = `${d.failure_code || "error"}: ${d.failure_message}`;
  } else if (d.error) {
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

// ─── V3 Voice Clone ───────────────────────────────────────────────────────────

/**
 * Create a HeyGen voice clone from an uploaded audio asset.
 *
 * Flow:
 *   1. Upload audio buffer to POST /v3/assets → asset_id
 *   2. POST /v3/voices with the asset_id → voice_id
 *
 * The returned voice_id is stored in the user's profile as heygen_voice_id
 * and passed as voice_id to the Video Agent so their cloned voice is used.
 */
export async function cloneVoice(
  audioBuffer: Buffer,
  name: string,
  contentType = "audio/mpeg",
): Promise<string> {
  const apiKey = getApiKey();

  // Step 1 — upload audio as asset
  console.log(`[heygen] Uploading voice sample (${(audioBuffer.length / 1024).toFixed(0)} KB)...`);
  const uploadRes = await fetch(`${HEYGEN_API}/v3/assets`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": contentType },
    body: new Uint8Array(audioBuffer),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => "unknown");
    throw new Error(`HeyGen voice asset upload failed (${uploadRes.status}): ${err.slice(0, 300)}`);
  }

  const uploadData = await uploadRes.json();
  const assetId = uploadData.data?.asset_id || uploadData.data?.id;
  if (!assetId) {
    throw new Error(`HeyGen returned no asset_id for voice upload. Response: ${JSON.stringify(uploadData).slice(0, 200)}`);
  }
  console.log(`[heygen] Voice asset uploaded: ${assetId}`);

  // Step 2 — create voice clone from asset
  console.log(`[heygen] Creating voice clone "${name}"...`);
  const cloneRes = await fetch(`${HEYGEN_API}/v3/voices`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      files: [{ type: "asset_id", asset_id: assetId }],
    }),
  });

  const rawText = await cloneRes.text();
  console.log(`[heygen] Voice clone response (${cloneRes.status}):`, rawText.slice(0, 300));

  if (!cloneRes.ok) {
    throw new Error(`HeyGen voice clone failed (${cloneRes.status}): ${rawText.slice(0, 300)}`);
  }

  const cloneData = JSON.parse(rawText);
  const voiceId = cloneData.data?.voice_id || cloneData.data?.id;
  if (!voiceId) {
    throw new Error(`HeyGen returned no voice_id. Response: ${rawText.slice(0, 200)}`);
  }

  console.log(`[heygen] Voice clone created: ${voiceId}`);
  return voiceId;
}

// ─── V3 Video Agent API ───────────────────────────────────────────────────────

export interface VideoAgentFile {
  type: "url";
  url: string;
}

export interface GenerateVideoAgentParams {
  prompt: string;
  avatarId?: string;
  voiceId?: string;
  orientation?: "landscape" | "portrait" | "square";
  files?: VideoAgentFile[];
  callbackUrl?: string;
  callbackId?: string;
  styleId?: string;
}

export interface VideoAgentSession {
  sessionId: string;
  /** "generating" = storyboard phase; "thinking" = agent reasoning; "processing" = rendering */
  status: "pending" | "thinking" | "generating" | "processing" | "completed" | "failed";
  videoId: string | null;
  error: string | null;
}

/**
 * Fetch the first cinematic style ID from HeyGen's style library.
 * Used to apply a professional cinematic look to Video Agent renders.
 * Returns null on failure — the caller should proceed without a style_id.
 */
export async function getCinematicStyleId(): Promise<string | null> {
  try {
    const res = await fetch(
      `${HEYGEN_API}/v3/video-agents/styles?tag=cinematic&limit=1`,
      { headers: { "x-api-key": getApiKey() } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const styleId = data.data?.[0]?.style_id || null;
    if (styleId) console.log(`[heygen] Using cinematic style: ${styleId}`);
    return styleId;
  } catch {
    return null;
  }
}

let _cachedPrivateVoiceId: string | null | undefined = undefined;

/**
 * Fetch the user's first private (cloned) voice ID via GET /v3/voices?type=private.
 * Used as fallback when profile.heygen_voice_id is not set.
 */
export async function getPrivateVoiceId(): Promise<string | null> {
  if (_cachedPrivateVoiceId !== undefined) return _cachedPrivateVoiceId;
  try {
    const res = await fetch(`${HEYGEN_API}/v3/voices?type=private`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) { _cachedPrivateVoiceId = null; return null; }
    const data = await res.json();
    const voices: Array<{ voice_id: string }> = data.data?.voices || data.data || [];
    _cachedPrivateVoiceId = voices[0]?.voice_id || null;
    if (_cachedPrivateVoiceId) console.log(`[heygen] Private voice fallback: ${_cachedPrivateVoiceId}`);
    return _cachedPrivateVoiceId;
  } catch {
    _cachedPrivateVoiceId = null;
    return null;
  }
}

let _cachedVoiceId: string | null | undefined = undefined;

/**
 * Fetch a default English voice ID from HeyGen's voice library.
 * Used as fallback when the user hasn't set up a HeyGen voice clone.
 * Result is cached for the lifetime of the serverless instance.
 */
export async function getDefaultEnglishVoiceId(): Promise<string | null> {
  if (_cachedVoiceId !== undefined) return _cachedVoiceId;
  try {
    const res = await fetch(`${HEYGEN_API}/v2/voices`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) { _cachedVoiceId = null; return null; }
    const data = await res.json();
    const voices: Array<{ voice_id: string; language?: string; locale?: string }> =
      data.data?.voices || data.data || [];
    const voice = voices.find((v) =>
      (v.language || v.locale || "").toLowerCase().startsWith("en")
    );
    _cachedVoiceId = voice?.voice_id || null;
    if (_cachedVoiceId) console.log(`[heygen] Default voice: ${_cachedVoiceId}`);
    return _cachedVoiceId;
  } catch {
    _cachedVoiceId = null;
    return null;
  }
}
/**
 * Generate a video using the HeyGen Video Agent v3 API.
 *
 * The agent autonomously generates b-roll, scene layout, pacing, and
 * visual composition from the prompt. Returns a session_id for polling.
 *
 * NOTE: voice_id here must be a HeyGen native voice ID; ElevenLabs
 * cloned voices require pre-generating audio and attaching as a file.
 */
export async function generateVideoAgent(
  params: GenerateVideoAgentParams,
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    ...(params.avatarId && { avatar_id: params.avatarId }),
    ...(params.voiceId && { voice_id: params.voiceId }),
    ...(params.orientation && { orientation: params.orientation }),
    ...(params.files?.length && { files: params.files }),
    ...(params.callbackUrl && { callback_url: params.callbackUrl }),
    ...(params.callbackId && { callback_id: params.callbackId }),
    ...(params.styleId && { style_id: params.styleId }),
  };

  console.log(`[heygen] Submitting Video Agent v3 (${params.prompt.length} chars)...`);

  const res = await fetch(`${HEYGEN_API}/v3/video-agents`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log(`[heygen] Video Agent response (${res.status}):`, rawText.slice(0, 400));

  if (!res.ok) {
    throw new Error(`HeyGen Video Agent v3 failed (${res.status}): ${rawText.slice(0, 400)}`);
  }

  const data = JSON.parse(rawText);
  const sessionId = data.data?.session_id;
  if (!sessionId) {
    throw new Error(`HeyGen Video Agent returned no session_id. Response: ${rawText.slice(0, 300)}`);
  }

  console.log(`[heygen] Video Agent session created: ${sessionId}`);
  return sessionId;
}

/**
 * Poll the Video Agent session status.
 * Returns status and video_id once the agent has finished compositing.
 * Follows the two-step flow: session → video_id → GET /v3/videos/{id}
 */
export async function getVideoAgentSession(
  sessionId: string,
): Promise<VideoAgentSession> {
  const res = await fetch(
    `${HEYGEN_API}/v3/video-agents/${sessionId}`,
    { headers: { "x-api-key": getApiKey() } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen session poll failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const d = json.data;

  return {
    sessionId: d.session_id || sessionId,
    status: d.status,
    videoId: d.video_id || null,
    error: d.error
      ? (typeof d.error === "string" ? d.error : JSON.stringify(d.error))
      : null,
  };
}

/**
 * Get final video details from the v3 videos endpoint.
 * Called after getVideoAgentSession() returns a video_id.
 */
export async function getVideoV3Status(videoId: string): Promise<VideoStatus> {
  const res = await fetch(
    `${HEYGEN_API}/v3/videos/${videoId}`,
    { headers: { "x-api-key": getApiKey() } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen v3 video status failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const d = json.data;

  // v3 videos use failure_code + failure_message for render errors
  let errorMsg: string | null = null;
  if (d.failure_message) {
    errorMsg = `${d.failure_code || "error"}: ${d.failure_message}`;
  } else if (d.error) {
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

// ─── 6. Poll V3 Agent Until Complete ─────────────────────────────────────────

/**
 * Poll a Video Agent session until the video is completed or fails.
 * Handles the two-step flow automatically: session → video_id → final status.
 * Default: 10-minute timeout (agent renders take longer), poll every 15 seconds.
 */
export async function waitForVideoAgent(
  sessionId: string,
  timeoutMs = 600_000,
  intervalMs = 15_000,
): Promise<VideoStatus & { videoId: string }> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const session = await getVideoAgentSession(sessionId);
    console.log(`[heygen] Agent session ${sessionId}: ${session.status}`);

    if (session.status === "failed") {
      throw new Error(`HeyGen Video Agent failed: ${session.error || "unknown error"}`);
    }

    // "generating" = storyboard phase; "processing" = rendering; both are in-progress
    if (session.videoId) {
      const videoStatus = await getVideoV3Status(session.videoId);
      console.log(`[heygen] Video ${session.videoId}: ${videoStatus.status}`);

      if (videoStatus.status === "completed") {
        return { ...videoStatus, videoId: session.videoId };
      }
      if (videoStatus.status === "failed") {
        throw new Error(`HeyGen v3 video failed: ${videoStatus.error || "unknown error"}`);
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`HeyGen Video Agent timed out after ${Math.round(timeoutMs / 1000)}s`);
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
