import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeTikTokCode, getTikTokUserInfo } from "@/lib/api/social/tiktok";
import { encryptToken } from "@/lib/utils/encrypt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings/social?error=tiktok_denied`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const userId = stateData.userId;

    const tokens = await exchangeTikTokCode(code);
    const userInfo = await getTikTokUserInfo(tokens.access_token, tokens.open_id);

    const [encryptedAccess, encryptedRefresh] = await Promise.all([
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
    ]);

    const admin = createAdminClient();

    await admin.from("social_accounts").upsert({
      user_id: userId,
      platform: "tiktok",
      platform_user_id: tokens.open_id,
      platform_username: userInfo.username,
      access_token_enc: encryptedAccess,
      refresh_token_enc: encryptedRefresh,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
      avatar_url: userInfo.avatar_url,
      metadata: { open_id: tokens.open_id, display_name: userInfo.display_name } as unknown as Record<string, unknown>,
    }, { onConflict: "user_id,platform" });

    return NextResponse.redirect(`${appUrl}/settings/social?connected=tiktok`);
  } catch (err) {
    console.error("TikTok callback error:", err);
    return NextResponse.redirect(`${appUrl}/settings/social?error=tiktok_failed`);
  }
}
