// TikTok Content Posting API v2
const TIKTOK_OAUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API = "https://open.tiktokapis.com/v2";

export function getTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY!,
    scope: "user.info.basic,video.publish,video.upload",
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/tiktok/callback`,
    state,
  });
  return `${TIKTOK_OAUTH_URL}?${params}`;
}

export async function exchangeTikTokCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
}> {
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/tiktok/callback`,
    }),
  });

  if (!res.ok) throw new Error(`TikTok token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return data.data;
}

export async function getTikTokUserInfo(accessToken: string, openId: string): Promise<{
  username: string;
  display_name: string;
  avatar_url: string;
}> {
  const res = await fetch(
    `${TIKTOK_API}/user/info/?fields=open_id,union_id,avatar_url,display_name,username`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error("Failed to get TikTok user info");
  const data = await res.json();
  const user = data.data?.user;
  return {
    username: user?.username || openId,
    display_name: user?.display_name || "",
    avatar_url: user?.avatar_url || "",
  };
}

export interface TikTokPostParams {
  videoUrl: string;
  title: string;
  description?: string;
  privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  disableDuet?: boolean;
  disableStitch?: boolean;
  disableComment?: boolean;
}

export async function postToTikTok(
  accessToken: string,
  params: TikTokPostParams
): Promise<{ publish_id: string }> {
  // Step 1: Initialize video upload
  const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: params.title.slice(0, 150),
        description: params.description?.slice(0, 2200) || params.title,
        privacy_level: params.privacyLevel || "PUBLIC_TO_EVERYONE",
        disable_duet: params.disableDuet || false,
        disable_stitch: params.disableStitch || false,
        disable_comment: params.disableComment || false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: params.videoUrl,
      },
    }),
  });

  if (!initRes.ok) throw new Error(`TikTok post init failed: ${await initRes.text()}`);
  const initData = await initRes.json();
  const publishId = initData.data?.publish_id;
  if (!publishId) throw new Error("No publish_id from TikTok");

  return { publish_id: publishId };
}

export async function checkTikTokPostStatus(
  accessToken: string,
  publishId: string
): Promise<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }> {
  const res = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  if (!res.ok) throw new Error("Failed to check TikTok post status");
  const data = await res.json();
  return data.data;
}
