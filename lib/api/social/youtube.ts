const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function getYouTubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/youtube/callback`,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

export async function exchangeYouTubeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/youtube/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`YouTube token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshYouTubeToken(refreshToken: string): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("YouTube token refresh failed");
  const data = await res.json();
  return data.access_token;
}

export async function getYouTubeProfile(accessToken: string): Promise<{ channel_id: string; channel_name: string; avatar_url: string }> {
  const res = await fetch(`${YOUTUBE_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to get YouTube profile");
  const data = await res.json();
  const ch = data.items?.[0];
  return {
    channel_id: ch?.id || "",
    channel_name: ch?.snippet?.title || "",
    avatar_url: ch?.snippet?.thumbnails?.default?.url || "",
  };
}

export interface YouTubeUploadParams {
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: "public" | "unlisted" | "private";
  thumbnailUrl?: string;
}

export async function uploadToYouTube(
  accessToken: string,
  params: YouTubeUploadParams
): Promise<{ video_id: string; video_url: string }> {
  // Step 1: Fetch the video blob from the render URL
  const videoRes = await fetch(params.videoUrl);
  if (!videoRes.ok) throw new Error("Failed to fetch video for upload");
  const videoBuffer = await videoRes.arrayBuffer();

  // Step 2: Initiate resumable upload
  const metadataRes = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: params.title.slice(0, 100),
          description: params.description.slice(0, 5000),
          tags: params.tags.slice(0, 30),
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: params.privacyStatus || "public",
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!metadataRes.ok) throw new Error(`YouTube upload init failed: ${await metadataRes.text()}`);
  const uploadUrl = metadataRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL from YouTube");

  // Step 3: Upload the video
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) throw new Error(`YouTube video upload failed: ${await uploadRes.text()}`);
  const uploadData = await uploadRes.json();
  const videoId = uploadData.id;

  // Step 4: Set thumbnail if provided
  if (params.thumbnailUrl && videoId) {
    try {
      const thumbRes = await fetch(params.thumbnailUrl);
      const thumbBuffer = await thumbRes.arrayBuffer();
      await fetch(`${YOUTUBE_API}/thumbnails/set?videoId=${videoId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "image/jpeg",
        },
        body: thumbBuffer,
      });
    } catch {
      // Non-fatal — thumbnail upload failure shouldn't fail the whole post
    }
  }

  return {
    video_id: videoId,
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
