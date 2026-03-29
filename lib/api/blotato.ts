const BLOTATO_API = "https://backend.blotato.com";

function headers(apiKey: string) {
  return {
    "blotato-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

// ─── Accounts ─────────────────────────────────────────────────────────────

export interface BlotatoAccount {
  id: string;
  platform: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  subAccounts?: BlotatoAccount[];
}

export async function listAccounts(
  apiKey: string,
  platform?: string
): Promise<BlotatoAccount[]> {
  const url = platform
    ? `${BLOTATO_API}/v2/accounts?platform=${platform}`
    : `${BLOTATO_API}/v2/accounts`;

  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Blotato accounts error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.accounts || data || [];
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${BLOTATO_API}/v2/accounts`, {
      headers: headers(apiKey),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Media Upload ──────────────────────────────────────────────────────────

export interface BlotatoMedia {
  id: string;
  url: string;
  type: string;
}

export async function uploadMediaFromUrl(
  apiKey: string,
  mediaUrl: string,
  mediaType: "image" | "video" = "video"
): Promise<BlotatoMedia> {
  const res = await fetch(`${BLOTATO_API}/v2/media`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ url: mediaUrl, type: mediaType }),
  });
  if (!res.ok) throw new Error(`Blotato media upload error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Publishing ────────────────────────────────────────────────────────────

export type BlotatoPlatform =
  | "twitter" | "instagram" | "linkedin" | "facebook"
  | "tiktok" | "pinterest" | "threads" | "bluesky" | "youtube";

export interface PostTarget {
  accountId: string;
  platform: BlotatoPlatform;
  // Platform-specific fields
  caption?: string;         // Instagram, TikTok, Threads, Bluesky
  title?: string;           // YouTube, Pinterest
  description?: string;     // YouTube, LinkedIn
  privacy?: "public" | "unlisted" | "private";  // YouTube
  notifySubscribers?: boolean; // YouTube
  disableDuet?: boolean;    // TikTok
  disableStitch?: boolean;  // TikTok
  disableComment?: boolean; // TikTok
  mediaType?: "reel" | "video"; // Instagram, Facebook
  boardId?: string;         // Pinterest
}

export interface CreatePostParams {
  mediaId: string;          // Blotato media ID from uploadMediaFromUrl
  targets: PostTarget[];
  scheduledAt?: string;     // ISO 8601, omit for immediate
  text?: string;            // Generic text/caption fallback
}

export interface PostResult {
  id: string;
  status: string;
  scheduledAt?: string;
  targets?: Array<{ platform: string; status: string; postUrl?: string; error?: string }>;
}

export async function createPost(
  apiKey: string,
  params: CreatePostParams
): Promise<PostResult> {
  // Build Blotato post body
  const body: Record<string, unknown> = {
    media: [{ id: params.mediaId }],
    targets: params.targets.map((t) => buildTarget(t)),
  };

  if (params.scheduledAt) {
    body.scheduledAt = params.scheduledAt;
  }

  const res = await fetch(`${BLOTATO_API}/v2/posts`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Blotato post error ${res.status}: ${await res.text()}`);
  return res.json();
}

function buildTarget(t: PostTarget): Record<string, unknown> {
  const base: Record<string, unknown> = {
    account: { id: t.accountId },
  };

  switch (t.platform) {
    case "youtube":
      base.video = {
        title: t.title || "",
        description: t.description || "",
        privacy: t.privacy || "public",
        notifySubscribers: t.notifySubscribers ?? true,
      };
      break;
    case "instagram":
      base.video = {
        caption: t.caption || "",
        mediaType: t.mediaType || "reel",
      };
      break;
    case "tiktok":
      base.video = {
        caption: t.caption || "",
        disableDuet: t.disableDuet || false,
        disableStitch: t.disableStitch || false,
        disableComment: t.disableComment || false,
      };
      break;
    case "facebook":
      base.video = {
        caption: t.caption || "",
        mediaType: t.mediaType || "reel",
      };
      break;
    case "linkedin":
      base.post = { text: t.description || t.caption || "" };
      break;
    case "twitter":
      base.post = { text: t.caption || "" };
      break;
    case "threads":
      base.post = { text: t.caption || "" };
      break;
    case "bluesky":
      base.post = { text: t.caption || "" };
      break;
    case "pinterest":
      base.pin = {
        title: t.title || "",
        description: t.caption || "",
        boardId: t.boardId,
      };
      break;
  }

  return base;
}

export async function getPostStatus(apiKey: string, postId: string): Promise<PostResult> {
  const res = await fetch(`${BLOTATO_API}/v2/posts/${postId}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Blotato post status error ${res.status}`);
  return res.json();
}

// ─── Scheduling ────────────────────────────────────────────────────────────

export interface ScheduledPost {
  id: string;
  status: string;
  scheduledAt: string;
  targets?: PostTarget[];
}

export async function listScheduledPosts(
  apiKey: string,
  page = 1
): Promise<ScheduledPost[]> {
  const res = await fetch(`${BLOTATO_API}/v2/schedules?page=${page}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Blotato schedules error ${res.status}`);
  const data = await res.json();
  return data.schedules || data || [];
}

export async function cancelScheduledPost(
  apiKey: string,
  scheduleId: string
): Promise<void> {
  const res = await fetch(`${BLOTATO_API}/v2/schedules/${scheduleId}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Blotato cancel error ${res.status}`);
}

// ─── AI Asset Generation (b-roll / images) ────────────────────────────────

export interface SourceResolution {
  id: string;
  status: "pending" | "processing" | "done" | "failed";
  images?: Array<{ url: string; caption?: string }>;
  videos?: Array<{ url: string }>;
}

export async function generateAssets(
  apiKey: string,
  prompt: string,
  type: "images" | "video" = "images"
): Promise<SourceResolution> {
  const res = await fetch(`${BLOTATO_API}/v2/source-resolutions-v3`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      source: prompt,
      type,
      count: 3,
    }),
  });

  if (!res.ok) throw new Error(`Blotato asset gen error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function pollAssets(
  apiKey: string,
  resolutionId: string,
  maxAttempts = 12,
  intervalMs = 5000
): Promise<SourceResolution> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BLOTATO_API}/v2/source-resolutions-v3/${resolutionId}`,
      { headers: headers(apiKey) }
    );
    if (!res.ok) break;
    const data: SourceResolution = await res.json();
    if (data.status === "done" || data.status === "failed") return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { id: resolutionId, status: "failed" };
}

export async function generateAndWaitForAssets(
  apiKey: string,
  prompt: string
): Promise<string[]> {
  try {
    const job = await generateAssets(apiKey, prompt, "images");
    const result = await pollAssets(apiKey, job.id);
    return (result.images || []).map((img) => img.url).filter(Boolean);
  } catch {
    return []; // Non-fatal — Creatomate will use gradient background as fallback
  }
}
