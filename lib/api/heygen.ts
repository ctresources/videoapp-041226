/**
 * HeyGen API integration — v3 throughout.
 *
 * Primary pipeline (v3 Video Agent):
 *   1. Create photo avatar → group_id via POST /v3/avatars (type "photo")
 *   2. Clone the user's voice via POST /v3/voices/clone
 *   3. Upload assets via POST /v3/assets
 *   4. Submit Video Agent job via POST /v3/video-agents → session_id
 *   5. Two-step poll: GET /v3/video-agents/{session_id} → video_id → GET /v3/videos/{video_id}
 *
 * The only remaining v2 call is deleteAvatarLook (DELETE /v2/photo_avatar/{id}) —
 * HeyGen exposes no v3 delete-avatar endpoint yet. v2 is supported until Oct 31, 2026.
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

export interface AvatarLook {
  id: string;
  name: string;
  avatar_type: string;
  group_id: string | null;
  gender: string | null;
  preview_image_url: string | null;
  preview_video_url: string | null;
  status: string | null;
}

export const DIMENSIONS: Record<VideoType, { width: number; height: number }> = {
  blog_long:    { width: 1920, height: 1080 },
  youtube_16x9: { width: 1920, height: 1080 },
  reel_9x16:    { width: 1080, height: 1920 },
  short_1x1:    { width: 1080, height: 1080 },
};


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
 * Create a photo avatar for the user's headshot via POST /v3/avatars (type "photo").
 * Passes the Supabase public image URL directly — no intermediate asset upload.
 * Omitting avatar_group_id creates a new group; we return its group_id, which is
 * stored in the user's profile as heygen_photo_id and later resolved to a look
 * via getAvatarLooks().
 *
 * The new look trains asynchronously (status "processing"); the group_id is
 * usable immediately for look resolution.
 */
export async function uploadTalkingPhoto(imageUrl: string): Promise<string> {
  const apiKey = getApiKey();

  console.log(`[heygen] Creating photo avatar from ${imageUrl.slice(0, 80)}...`);

  const res = await fetch(`${HEYGEN_API}/v3/avatars`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "photo",
      name: `Avatar ${Date.now()}`,
      file: { type: "url", url: imageUrl },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen photo avatar creation failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  console.log("[heygen] Photo avatar response:", JSON.stringify(data).slice(0, 300));

  const item = data.data?.avatar_item;
  // group_id may be named differently across API versions; try all known locations
  const groupId =
    item?.avatar_group_id ||
    item?.group_id ||
    data.data?.avatar_group_id ||
    data.data?.group_id;
  if (!groupId) {
    throw new Error(`HeyGen returned no group_id for photo avatar. Response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  console.log(`[heygen] Talking photo avatar created: ${groupId}`);
  return groupId;
}

// ─── 1b. Add Look to Existing Avatar Group ───────────────────────────────────

/**
 * Add a new look (outfit/style) to an existing photo avatar group via POST /v3/avatars.
 * Passes the Supabase public URL directly — no intermediate asset upload needed.
 * Returns the new AvatarLookItem — status will be "processing" until training completes.
 */
export async function addAvatarLook(
  groupId: string,
  imageUrl: string,
  name: string,
): Promise<AvatarLook> {
  const apiKey = getApiKey();

  const createRes = await fetch(`${HEYGEN_API}/v3/avatars`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "photo",
      name,
      file: { type: "url", url: imageUrl },
      avatar_group_id: groupId,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => "unknown");
    throw new Error(`HeyGen avatar creation failed (${createRes.status}): ${err.slice(0, 300)}`);
  }
  const createData = await createRes.json();
  const item = createData.data?.avatar_item;
  if (!item) throw new Error(`HeyGen returned no avatar_item. Response: ${JSON.stringify(createData).slice(0, 200)}`);

  console.log(`[heygen] New look created: ${item.id} (${item.status})`);
  return item as AvatarLook;
}

// ─── 2a. Upload Video Asset (for b-roll backgrounds) ────────────────────────

/**
 * Upload an MP4 video clip to HeyGen as an asset (v3 endpoint).
 * Returns the asset_id for use in v2 scene backgrounds or v3 file references.
 */
export async function uploadVideoAsset(videoBuffer: Buffer): Promise<string> {
  console.log(`[heygen] Uploading video asset (${(videoBuffer.length / 1024).toFixed(0)} KB)...`);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }), "video.mp4");

  const res = await fetch(`${HEYGEN_API}/v3/assets`, {
    method: "POST",
    headers: { "x-api-key": getApiKey() },
    body: form,
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

// ─── 3. Poll for Completion ──────────────────────────────────────────────────

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
 * Create a HeyGen voice clone from the user's recorded audio.
 *
 * Flow (HeyGen v3):
 *   1. Upload audio buffer to POST /v3/assets → asset_id
 *   2. POST /v3/voices/clone with { audio: { type: "asset_id", asset_id } } → voice_clone_id
 *   3. Poll GET /v3/voices/{voice_clone_id} until status === "complete"
 *
 * Returns the user's own cloned voice_id, stored in the profile as heygen_voice_id
 * and passed as voice_id to the Video Agent so their real voice is used.
 *
 * Requires a paid HeyGen plan; accounts are capped at 10 voice clones.
 */
export async function cloneVoice(
  audioBuffer: Buffer,
  name: string,
  contentType = "audio/mpeg",
): Promise<string> {
  const apiKey = getApiKey();

  // Step 1 — upload audio as asset
  // Normalise content type: strip codec params and map webm/ogg → mpeg for HeyGen compatibility
  const normalizedType = contentType.startsWith("audio/webm") || contentType.startsWith("audio/ogg")
    ? "audio/mpeg"
    : contentType.split(";")[0].trim();

  console.log(`[heygen] Uploading voice sample (${(audioBuffer.length / 1024).toFixed(0)} KB, type: ${normalizedType})...`);

  // Manually construct multipart/form-data — more reliable than FormData+Blob in Node.js server envs
  const boundary = `----HeyGenBoundary${Date.now().toString(36)}`;
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.mp3"\r\nContent-Type: ${normalizedType}\r\n\r\n`
  );
  const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);
  const audioBytes = new Uint8Array(audioBuffer);
  const multipartBody = new Uint8Array(preamble.length + audioBytes.length + epilogue.length);
  multipartBody.set(preamble, 0);
  multipartBody.set(audioBytes, preamble.length);
  multipartBody.set(epilogue, preamble.length + audioBytes.length);

  const uploadRes = await fetch(`${HEYGEN_API}/v3/assets`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
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

  // Step 2 — create the voice clone from the uploaded asset
  const cloneRes = await fetch(`${HEYGEN_API}/v3/voices/clone`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: { type: "asset_id", asset_id: assetId },
      voice_name: name.slice(0, 100),
      language: "en",
    }),
  });

  if (!cloneRes.ok) {
    const err = await cloneRes.text().catch(() => "unknown");
    // Surface HeyGen's own message (e.g. clone limit reached, plan upgrade required)
    throw new Error(`HeyGen voice clone failed (${cloneRes.status}): ${err.slice(0, 300)}`);
  }

  const cloneData = await cloneRes.json();
  const voiceCloneId: string | undefined =
    cloneData.data?.voice_clone_id || cloneData.data?.voice_id || cloneData.data?.id;
  if (!voiceCloneId) {
    throw new Error(`HeyGen returned no voice_clone_id. Response: ${JSON.stringify(cloneData).slice(0, 200)}`);
  }
  console.log(`[heygen] Voice clone created: ${voiceCloneId} — polling until complete...`);

  // Step 3 — poll until the clone finishes training (usually well under a minute)
  const status = await waitForVoiceClone(voiceCloneId);
  if (status === "failed") {
    throw new Error("HeyGen voice clone failed during processing. Please re-record and try again.");
  }
  console.log(`[heygen] Voice clone ready: ${voiceCloneId} (status: ${status})`);
  return voiceCloneId;
}

/**
 * Poll GET /v3/voices/{voice_id} until the clone status is "complete" or "failed".
 * Returns the terminal status. Times out to "complete" optimistically so a slow
 * poll doesn't block the user — the voice_id is valid regardless.
 */
async function waitForVoiceClone(
  voiceId: string,
  timeoutMs = 90_000,
  intervalMs = 3_000,
): Promise<"complete" | "failed" | "processing"> {
  const apiKey = getApiKey();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${HEYGEN_API}/v3/voices/${voiceId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (res.ok) {
      const json = await res.json();
      // Status only present for cloned voices; a public voice has none.
      const status: string | undefined = json.data?.status;
      if (status === "complete") return "complete";
      if (status === "failed") return "failed";
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  console.warn(`[heygen] Voice clone ${voiceId} still processing after ${Math.round(timeoutMs / 1000)}s — proceeding.`);
  return "processing";
}

// ─── V3 Avatar Video Generation (POST /v3/videos) ────────────────────────────

export interface GenerateVideoV3Params {
  avatarId: string;
  voiceId: string;
  scriptText: string;
  dimension: { width: number; height: number };
  title?: string;
  callbackUrl?: string;
  callbackId?: string;
  backgroundColor?: string;
  /**
   * Avatar rendering engine. Omit to use HeyGen's default (avatar_iv).
   * avatar_v = highest-fidelity motion/lip-sync — Digital Twin looks only,
   * same $0.0667/sec price as avatar_iv on twins (measured ~3.5 min for a
   * ~22s render vs ~4.2 min on avatar_iv).
   */
  engine?: "avatar_iii" | "avatar_iv" | "avatar_v";
}

/** Map pixel dimensions to the aspect_ratio string the v3 Videos API expects. */
function dimensionToAspectRatio(d: { width: number; height: number }): "16:9" | "9:16" | "1:1" {
  if (d.width > d.height) return "16:9";
  if (d.width < d.height) return "9:16";
  return "1:1";
}

/**
 * Generate an avatar video using HeyGen's v3 Videos API (POST /v3/videos) —
 * the "Direct Video" path: a single talking-head from one avatar look + voice +
 * script. Unlike the Video Agent, it does NOT compose listing photos / b-roll.
 *
 * Request shape follows the published v3 docs: type "avatar" with avatar_id,
 * voice_id, script, aspect_ratio, and resolution. Returns video_id for polling
 * via GET /v3/videos/{id} (getVideoV3Status).
 */
export async function generateVideoV3(params: GenerateVideoV3Params): Promise<string> {
  const body = {
    type: "avatar",
    avatar_id: params.avatarId,
    voice_id: params.voiceId,
    script: params.scriptText,
    title: params.title || "Generated Video",
    aspect_ratio: dimensionToAspectRatio(params.dimension),
    resolution: "1080p",
    ...(params.engine && { engine: { type: params.engine } }),
    ...(params.callbackUrl && { callback_url: params.callbackUrl }),
    ...(params.callbackId && { callback_id: params.callbackId }),
  };

  console.log(`[heygen] Submitting v3 avatar video (avatar: ${params.avatarId}, voice: ${params.voiceId}, engine: ${params.engine ?? "default"})...`);

  const res = await fetch(`${HEYGEN_API}/v3/videos`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log(`[heygen] v3 videos response (${res.status}):`, rawText.slice(0, 400));

  if (!res.ok) {
    throw new Error(`HeyGen v3 Videos failed (${res.status}): ${rawText.slice(0, 400)}`);
  }

  const data = JSON.parse(rawText);
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error(`HeyGen v3 Videos returned no video_id. Response: ${rawText.slice(0, 300)}`);

  console.log(`[heygen] v3 video submitted: ${videoId}`);
  return videoId;
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


/**
 * Fetch all completed looks for an avatar group (GET /v3/avatars/looks).
 * Pass a look's `id` as `avatar_id` when creating a video.
 */
export async function getAvatarLooks(groupId: string): Promise<AvatarLook[]> {
  const looks: AvatarLook[] = [];
  let token: string | undefined;

  do {
    const params = new URLSearchParams({
      group_id: groupId,
      ownership: "private",
      limit: "50",
      ...(token ? { token } : {}),
    });
    const res = await fetch(`${HEYGEN_API}/v3/avatars/looks?${params}`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) break;
    const data = await res.json();
    const page: AvatarLook[] = data.data || [];
    looks.push(...page);
    token = data.has_more ? data.next_token : undefined;
  } while (token);

  console.log(`[heygen] getAvatarLooks(${groupId}): ${looks.length} looks`);
  return looks;
}

/**
 * Fetch all private looks across all groups (no group_id filter).
 * Used to recover a Digital Twin look when only the look_id is known.
 * Returns an empty array if HeyGen doesn't support this query.
 */
export async function getAllPrivateLooks(): Promise<AvatarLook[]> {
  const looks: AvatarLook[] = [];
  let token: string | undefined;

  do {
    const params = new URLSearchParams({
      ownership: "private",
      limit: "50",
      ...(token ? { token } : {}),
    });
    const res = await fetch(`${HEYGEN_API}/v3/avatars/looks?${params}`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) break;
    const data = await res.json();
    const page: AvatarLook[] = data.data || [];
    looks.push(...page);
    token = data.has_more ? data.next_token : undefined;
  } while (token);

  console.log(`[heygen] getAllPrivateLooks: ${looks.length} total looks`);
  return looks;
}

/**
 * Initiate the HeyGen consent flow for an avatar group.
 * Returns the URL the user must visit to approve their avatar.
 * Only needed when a look has status "pending_consent".
 */
export async function getAvatarConsentUrl(
  groupId: string,
  rerouteUrl?: string,
): Promise<string> {
  const res = await fetch(`${HEYGEN_API}/v3/avatars/${groupId}/consent`, {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(rerouteUrl ? { reroute_url: rerouteUrl } : {}),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen consent initiation failed (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const url = data.data?.url;
  if (!url) throw new Error("HeyGen returned no consent URL");
  console.log(`[heygen] Consent URL for group ${groupId}: ${url}`);
  return url;
}

/**
 * Fetch the user's first private (cloned) voice ID via GET /v3/voices?type=private.
 * Used as fallback when profile.heygen_voice_id is not set.
 * No module-level caching — serverless instances can cache stale nulls across requests.
 */
export async function getPrivateVoiceId(): Promise<string | null> {
  try {
    const res = await fetch(`${HEYGEN_API}/v3/voices?type=private`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const voices: Array<{ voice_id: string }> = data.data?.voices || data.data || [];
    const voiceId = voices[0]?.voice_id || null;
    if (voiceId) console.log(`[heygen] Private voice fallback: ${voiceId}`);
    return voiceId;
  } catch {
    return null;
  }
}

/**
 * Fetch a default English voice ID from HeyGen's public voice library (v3).
 * Used as last-resort fallback when no private voice clone exists.
 * No module-level caching — avoids stale null across serverless instances.
 */
export async function getDefaultEnglishVoiceId(): Promise<string | null> {
  try {
    const params = new URLSearchParams({ type: "public", language: "English", limit: "1" });
    const res = await fetch(`${HEYGEN_API}/v3/voices?${params}`, {
      headers: { "x-api-key": getApiKey() },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const voices: Array<{ voice_id: string; language?: string }> =
      data.data?.voices || data.data || [];
    // Prefer an explicit English match; fall back to the first returned voice.
    const voice =
      voices.find((v) => (v.language || "").toLowerCase().startsWith("en")) || voices[0];
    const voiceId = voice?.voice_id || null;
    if (voiceId) console.log(`[heygen] Default voice: ${voiceId}`);
    return voiceId;
  } catch {
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

  console.log(
    `[heygen] Submitting Video Agent v3 (${params.prompt.length} chars, ` +
    `orientation=${params.orientation ?? "auto"}, avatar=${params.avatarId ?? "none"}, ` +
    `voice=${params.voiceId ?? "none"}, files=${params.files?.length ?? 0})`,
  );

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

// ─── Generate New Look for Existing Avatar ───────────────────────────────────

/**
 * Generate a new look (outfit/setting/style) for an existing avatar via prompt.
 * Uses POST /v3/avatars with type "prompt" and avatar_id as the visual reference.
 * The new look is saved to the same group as the referenced avatar automatically.
 * Cost: $1.00 per generated look.
 */
export async function generateAvatarLook(
  avatarId: string,
  prompt: string,
  name: string,
): Promise<AvatarLook> {
  const res = await fetch(`${HEYGEN_API}/v3/avatars`, {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "prompt", name, prompt, avatar_id: avatarId }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen generate look failed (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  console.log(`[heygen] generateAvatarLook response: ${JSON.stringify(data).slice(0, 400)}`);
  const item = data.data?.avatar_item;
  if (!item) throw new Error(`HeyGen returned no avatar_item: ${JSON.stringify(data).slice(0, 200)}`);
  console.log(`[heygen] New look generated: ${item.id} (status: ${item.status})`);
  return item as AvatarLook;
}

// ─── Digital Twin Creation ────────────────────────────────────────────────────

export interface DigitalTwinResult {
  lookId: string;
  groupId: string;
  status: string;
}

/**
 * Create a Digital Twin avatar from a video URL via POST /v3/avatars.
 * Returns the look ID and group ID for consent + polling.
 * Training takes 15–30 minutes; poll via getAvatarLooks(groupId).
 */
export async function createDigitalTwin(
  videoUrl: string,
  name: string,
): Promise<DigitalTwinResult> {
  const apiKey = getApiKey();
  const res = await fetch(`${HEYGEN_API}/v3/avatars`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "digital_twin",
      name,
      file: { type: "url", url: videoUrl },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HeyGen Digital Twin creation failed (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  console.log(`[heygen] Digital Twin raw response: ${JSON.stringify(data).slice(0, 500)}`);
  const item = data.data?.avatar_item;
  if (!item) throw new Error(`HeyGen returned no avatar_item: ${JSON.stringify(data).slice(0, 200)}`);
  // group_id may be named differently across API versions; try all known locations
  const groupId =
    (item.avatar_group_id as string | undefined) ||
    (item.group_id as string | undefined) ||
    (data.data?.avatar_group_id as string | undefined) ||
    (data.data?.group_id as string | undefined) ||
    "";
  console.log(`[heygen] Digital Twin: look=${item.id}, group=${groupId}, status=${item.status}`);
  return { lookId: item.id, groupId, status: item.status };
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
