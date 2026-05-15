import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAuthUrl } from "@/lib/api/youtube";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// GET — initiate Google OAuth for YouTube
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      `${appUrl}/social?youtube_error=${encodeURIComponent("YouTube integration not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")}`
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("yt_oauth_state", `${state}:${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthUrl(state));
}

// DELETE — disconnect YouTube
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_token_expires_at: null,
      youtube_channel_id: null,
      youtube_channel_name: null,
      youtube_channel_thumbnail: null,
    })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
