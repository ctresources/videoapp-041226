// Instagram Graph API (requires Facebook App + Instagram Business/Creator account)
const GRAPH_API = "https://graph.facebook.com/v19.0";
const OAUTH_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const OAUTH_TOKEN_URL = `${GRAPH_API}/oauth/access_token`;

export function getInstagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/instagram/callback`,
    scope: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ].join(","),
    response_type: "code",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

export async function exchangeInstagramCode(code: string): Promise<{
  access_token: string;
  token_type: string;
}> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/connect/instagram/callback`,
      code,
    }),
  });

  if (!res.ok) throw new Error(`Instagram token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function getLongLivedToken(shortToken: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${shortToken}`
  );
  if (!res.ok) throw new Error("Failed to get long-lived token");
  const data = await res.json();
  return data.access_token;
}

export async function getInstagramBusinessAccount(accessToken: string): Promise<{
  ig_user_id: string;
  username: string;
  account_name: string;
}> {
  // Get Facebook pages
  const pagesRes = await fetch(`${GRAPH_API}/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) throw new Error("Failed to get Facebook pages");
  const pagesData = await pagesRes.json();
  const page = pagesData.data?.[0];
  if (!page) throw new Error("No Facebook page found. Connect a Facebook Page linked to an Instagram Business account.");

  // Get Instagram account linked to page
  const igRes = await fetch(
    `${GRAPH_API}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
  );
  const igData = await igRes.json();
  const igId = igData.instagram_business_account?.id;
  if (!igId) throw new Error("No Instagram Business account linked to this Facebook Page.");

  // Get IG username
  const userRes = await fetch(`${GRAPH_API}/${igId}?fields=username,name&access_token=${page.access_token}`);
  const userData = await userRes.json();

  return {
    ig_user_id: igId,
    username: userData.username || "",
    account_name: userData.name || page.name,
  };
}

export interface InstagramPostParams {
  videoUrl: string;
  caption: string;
  coverImageUrl?: string;
  mediaType?: "REELS" | "VIDEO";
}

export async function postToInstagram(
  accessToken: string,
  igUserId: string,
  params: InstagramPostParams
): Promise<{ post_id: string; post_url: string }> {
  const mediaType = params.mediaType || "REELS";

  // Step 1: Create media container
  const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: mediaType,
      video_url: params.videoUrl,
      caption: params.caption.slice(0, 2200),
      cover_url: params.coverImageUrl,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) throw new Error(`Instagram container creation failed: ${await containerRes.text()}`);
  const containerData = await containerRes.json();
  const containerId = containerData.id;

  // Step 2: Poll for container status (processing takes time)
  let attempts = 0;
  while (attempts < 20) {
    await new Promise((r) => setTimeout(r, 5000)); // wait 5s between checks
    const statusRes = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    if (statusData.status_code === "FINISHED") break;
    if (statusData.status_code === "ERROR") throw new Error("Instagram media processing failed");
    attempts++;
  }

  // Step 3: Publish
  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) throw new Error(`Instagram publish failed: ${await publishRes.text()}`);
  const publishData = await publishRes.json();

  return {
    post_id: publishData.id,
    post_url: `https://www.instagram.com/p/${publishData.id}/`,
  };
}
