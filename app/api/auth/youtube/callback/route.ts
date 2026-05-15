import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, getChannelInfo } from "@/lib/api/youtube";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsUrl = `${appUrl}/social`;

  if (error) {
    return NextResponse.redirect(`${settingsUrl}?youtube_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?youtube_error=missing_params`);
  }

  // Validate state + extract userId from cookie
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("yt_oauth_state")?.value;
  if (!cookieVal) {
    return NextResponse.redirect(`${settingsUrl}?youtube_error=session_expired`);
  }

  const [cookieState, userId] = cookieVal.split(":");
  if (cookieState !== state || !userId) {
    return NextResponse.redirect(`${settingsUrl}?youtube_error=invalid_state`);
  }

  // Clear cookie
  cookieStore.delete("yt_oauth_state");

  try {
    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const channel = await getChannelInfo(tokens.access_token);

    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        youtube_access_token: tokens.access_token,
        youtube_refresh_token: tokens.refresh_token,
        youtube_token_expires_at: expiresAt,
        youtube_channel_id: channel.id,
        youtube_channel_name: channel.name,
        youtube_channel_thumbnail: channel.thumbnail,
      })
      .eq("id", userId);

    return NextResponse.redirect(`${settingsUrl}?youtube=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    console.error("[youtube-callback] error:", msg);
    return NextResponse.redirect(`${settingsUrl}?youtube_error=${encodeURIComponent(msg)}`);
  }
}
