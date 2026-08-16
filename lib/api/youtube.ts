import {
  decryptToken,
  encryptToken,
  encryptionEnabled,
  isEncrypted,
} from "@/lib/crypto/tokens";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/auth/youtube/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // select_account forces the Google account picker (and YouTube brand-channel picker)
    // consent forces the consent screen so we always get a refresh_token
    prompt: "select_account consent",
    include_granted_scopes: "false",
    state,
  });
  return `${GOOGLE_OAUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

/**
 * The channel belonging to the token's identity.
 *
 * `mine=true` returns exactly ONE channel — the one owned by whichever
 * identity the token was issued for — so there is nothing here to choose
 * between. Measured, not assumed: a diagnostic on this call recorded a
 * single-element response on a Google account that owns four channels.
 *
 * Which channel that is comes down to what the user picks in Google's own
 * OAuth chooser, and nothing here can influence it. Worth knowing because the
 * chooser lists BRAND ACCOUNT names, which are frequently not the channel's
 * YouTube display name — a user hunting for their channel by its real name can
 * pick an entry called something else entirely and land on the wrong channel,
 * with the app none the wiser. If a user reports being connected to the wrong
 * channel, that mismatch is the first thing to check; the fix is on Google's
 * screens, not in this file.
 */
export async function getChannelInfo(accessToken: string): Promise<{
  id: string;
  name: string;
  thumbnail: string | null;
}> {
  const res = await fetch(`${YOUTUBE_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Channel info failed: ${await res.text()}`);
  const data = await res.json();
  const channel = data.items?.[0];
  if (!channel) throw new Error("No YouTube channel found for this Google account");
  return {
    id: channel.id as string,
    name: channel.snippet.title as string,
    thumbnail: (channel.snippet.thumbnails?.default?.url as string) ?? null,
  };
}

// Returns a valid (possibly refreshed) access token, saving new token to DB if needed.
//
// Tokens are stored encrypted when TOKEN_ENCRYPTION_KEY is configured. Reads go
// through decryptToken(), which passes plaintext straight back, so rows written
// before the key existed keep working and are migrated in place the first time
// they are touched.
export async function getValidAccessToken(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("youtube_access_token, youtube_refresh_token, youtube_token_expires_at")
    .eq("id", userId)
    .single();

  if (!profile?.youtube_refresh_token) {
    throw new Error("YouTube not connected. Go to Settings → Social Accounts to connect.");
  }

  const refreshToken = decryptToken(profile.youtube_refresh_token)!;

  const expiresAt = profile.youtube_token_expires_at
    ? new Date(profile.youtube_token_expires_at)
    : null;
  const needsRefresh = !expiresAt || expiresAt <= new Date(Date.now() + 60_000);

  if (!needsRefresh && profile.youtube_access_token) {
    const accessToken = decryptToken(profile.youtube_access_token)!;

    // A still-valid token means no refresh round-trip, which would otherwise be
    // the only thing that ever rewrites these columns. Migrate here too, or a
    // row whose token stays fresh would sit in plaintext indefinitely.
    if (encryptionEnabled() && !isEncrypted(profile.youtube_refresh_token)) {
      await admin
        .from("profiles")
        .update({
          youtube_access_token: encryptToken(accessToken),
          youtube_refresh_token: encryptToken(refreshToken),
        })
        .eq("id", userId);
    }

    return accessToken;
  }

  const tokens = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // ?? falls back to the raw value when no key is configured, preserving the
  // original plaintext behaviour exactly.
  await admin
    .from("profiles")
    .update({
      youtube_access_token: encryptToken(tokens.access_token) ?? tokens.access_token,
      youtube_refresh_token: encryptToken(refreshToken) ?? refreshToken,
      youtube_token_expires_at: newExpiresAt,
    })
    .eq("id", userId);

  return tokens.access_token;
}

/**
 * Set a custom thumbnail on an uploaded YouTube video. Requires the channel
 * to be phone-verified for custom thumbnails — callers should treat failures
 * as non-fatal and fall back to manual upload in YouTube Studio.
 */
export async function setVideoThumbnail(
  accessToken: string,
  youtubeVideoId: string,
  thumbnailUrl: string,
): Promise<void> {
  const imgRes = await fetch(thumbnailUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch thumbnail image (${imgRes.status})`);
  const buf = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") || "image/png";

  const res = await fetch(
    `${YOUTUBE_UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(youtubeVideoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
        "Content-Length": String(buf.byteLength),
      },
      body: buf,
    },
  );
  if (!res.ok) throw new Error(`Thumbnail set failed (${res.status}): ${await res.text()}`);
}

export async function uploadVideoToYouTube(
  accessToken: string,
  params: {
    videoUrl: string;
    title: string;
    description: string;
    privacy: "public" | "unlisted" | "private";
    tags?: string[];
  },
): Promise<{ videoId: string; youtubeUrl: string }> {
  // Step 1 — initiate resumable upload session
  const initRes = await fetch(
    `${YOUTUBE_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: params.title.slice(0, 100),
          description: params.description,
          tags: params.tags || [],
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: params.privacy,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );

  if (!initRes.ok) {
    throw new Error(`YouTube upload session failed: ${await initRes.text()}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned from YouTube");

  // Step 2 — fetch video content from storage URL
  const videoRes = await fetch(params.videoUrl);
  if (!videoRes.ok) throw new Error("Failed to fetch video from storage");
  const videoBuffer = await videoRes.arrayBuffer();
  const contentType = videoRes.headers.get("content-type") || "video/mp4";

  // Step 3 — upload to YouTube
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
    throw new Error(`YouTube upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }

  const result = await uploadRes.json();
  return {
    videoId: result.id as string,
    youtubeUrl: `https://www.youtube.com/watch?v=${result.id}`,
  };
}
