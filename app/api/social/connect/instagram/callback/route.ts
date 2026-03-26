import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeInstagramCode,
  getLongLivedToken,
  getInstagramBusinessAccount,
} from "@/lib/api/social/instagram";
import { encryptToken } from "@/lib/utils/encrypt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings/social?error=instagram_denied`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const userId = stateData.userId;

    // Exchange short-lived token
    const shortToken = await exchangeInstagramCode(code);
    // Upgrade to long-lived (60-day) token
    const longToken = await getLongLivedToken(shortToken.access_token);

    // Get Instagram Business account
    const igAccount = await getInstagramBusinessAccount(longToken);

    const encryptedAccess = await encryptToken(longToken);

    const admin = createAdminClient();

    await admin.from("social_accounts").upsert({
      user_id: userId,
      platform: "instagram",
      platform_user_id: igAccount.ig_user_id,
      platform_username: igAccount.username,
      access_token_enc: encryptedAccess,
      // Token expires in 60 days
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
      metadata: { ig_user_id: igAccount.ig_user_id, account_name: igAccount.account_name } as unknown as Record<string, unknown>,
    }, { onConflict: "user_id,platform" });

    return NextResponse.redirect(`${appUrl}/settings/social?connected=instagram`);
  } catch (err) {
    console.error("Instagram callback error:", err);
    const msg = err instanceof Error ? err.message : "instagram_failed";
    return NextResponse.redirect(`${appUrl}/settings/social?error=${encodeURIComponent(msg)}`);
  }
}
