/**
 * GET /api/social/accounts — the social accounts this user has connected.
 *
 * YouTube, connected natively through our own OAuth, is the only one today.
 * This route used to merge in accounts from Blotato as well, but Blotato was
 * never configured by anyone (no profile has ever held a key) and the owner
 * has settled on Upload-Post instead, so that half was code that could not
 * run. Its POST and DELETE handlers, which saved and cleared the Blotato API
 * key, are gone with it.
 *
 * The response keeps its shape — `accounts`, `connected`, `youtubeConnected` —
 * because the Publish window and the social settings page both read it.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[social/accounts] no user — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read through the user's own session rather than the admin client, which
  // avoids the RLS surprises the admin path used to produce here.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("youtube_channel_id, youtube_channel_name, youtube_channel_thumbnail")
    .eq("id", user.id)
    .single();

  if (profileError) console.log("[social/accounts] profile query error:", profileError.message);

  const p = profile as {
    youtube_channel_id: string | null;
    youtube_channel_name: string | null;
    youtube_channel_thumbnail: string | null;
  } | null;

  const accounts = p?.youtube_channel_id
    ? [{
        id: "native_youtube",
        platform: "youtube",
        name: p.youtube_channel_name || "YouTube Channel",
        username: p.youtube_channel_name || "YouTube Channel",
        // The real UC… id, shown in the UI. A Google account can own several
        // channels with near-identical names, so the name alone cannot confirm
        // which one is connected — the id is the only unambiguous answer.
        channelId: p.youtube_channel_id,
        avatarUrl: p.youtube_channel_thumbnail || undefined,
        source: "native" as const,
      }]
    : [];

  return NextResponse.json({
    accounts,
    connected: accounts.length > 0,
    youtubeConnected: accounts.length > 0,
  });
}
