import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeYouTubeCode, getYouTubeProfile } from "@/lib/api/social/youtube";
import { encryptToken } from "@/lib/utils/encrypt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings/social?error=youtube_denied`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const userId = stateData.userId;

    // Exchange code for tokens
    const tokens = await exchangeYouTubeCode(code);

    // Get channel profile
    const profile = await getYouTubeProfile(tokens.access_token);

    // Encrypt tokens before storing
    const [encryptedAccess, encryptedRefresh] = await Promise.all([
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
    ]);

    const admin = createAdminClient();

    // Upsert social account
    await admin.from("social_accounts").upsert({
      user_id: userId,
      platform: "youtube",
      platform_user_id: profile.channel_id,
      platform_username: profile.channel_name,
      access_token_enc: encryptedAccess,
      refresh_token_enc: encryptedRefresh,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
      avatar_url: profile.avatar_url,
      metadata: { channel_id: profile.channel_id } as unknown as Record<string, unknown>,
    }, { onConflict: "user_id,platform" });

    return NextResponse.redirect(`${appUrl}/settings/social?connected=youtube`);
  } catch (err) {
    console.error("YouTube callback error:", err);
    return NextResponse.redirect(`${appUrl}/settings/social?error=youtube_failed`);
  }
}
