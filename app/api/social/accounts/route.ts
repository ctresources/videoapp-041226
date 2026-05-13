import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAccounts, validateApiKey } from "@/lib/api/blotato";
import { NextRequest, NextResponse } from "next/server";

// GET - list connected social accounts (native YouTube + Blotato)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[social/accounts] no user — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("blotato_api_key, youtube_channel_id, youtube_channel_name, youtube_channel_thumbnail")
    .eq("id", user.id)
    .single();

  if (profileError) console.log("[social/accounts] profile query error:", profileError.message);

  const p = profile as {
    blotato_api_key: string | null;
    youtube_channel_id: string | null;
    youtube_channel_name: string | null;
    youtube_channel_thumbnail: string | null;
  } | null;

  console.log("[social/accounts] user:", user.id, "yt_channel:", p?.youtube_channel_id ?? "none");

  // Native YouTube account (appears first in the list)
  const nativeYouTube = p?.youtube_channel_id
    ? [{
        id: "native_youtube",
        platform: "youtube",
        name: p.youtube_channel_name || "YouTube Channel",
        username: p.youtube_channel_name || "YouTube Channel",
        avatarUrl: p.youtube_channel_thumbnail || undefined,
        source: "native" as const,
      }]
    : [];

  // Blotato accounts (filter out YouTube if native YouTube is connected)
  const blotatoKey = p?.blotato_api_key;
  let blotatoAccounts: Array<{ id: string; platform: string; name: string; username?: string; avatarUrl?: string; source?: string }> = [];
  let blotatoConnected = false;

  if (blotatoKey) {
    try {
      const accounts = await listAccounts(blotatoKey);
      // Skip Blotato's YouTube account when native YouTube is connected
      blotatoAccounts = accounts
        .filter((a) => !(p?.youtube_channel_id && a.platform.toLowerCase() === "youtube"))
        .map((a) => ({ ...a, source: "blotato" as const }));
      blotatoConnected = true;
    } catch {
      // Blotato key invalid — ignore
    }
  }

  const accounts = [...nativeYouTube, ...blotatoAccounts];
  const connected = blotatoConnected || nativeYouTube.length > 0;

  console.log("[social/accounts] returning", accounts.length, "accounts, youtubeConnected:", nativeYouTube.length > 0);
  return NextResponse.json({ accounts, connected, youtubeConnected: nativeYouTube.length > 0 });
}

// POST - save / validate Blotato API key
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  const valid = await validateApiKey(apiKey);
  if (!valid) return NextResponse.json({ error: "Invalid Blotato API key" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("profiles").update({ blotato_api_key: apiKey }).eq("id", user.id);

  const accounts = await listAccounts(apiKey);
  return NextResponse.json({ success: true, accounts });
}

// DELETE - remove Blotato API key
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin.from("profiles").update({ blotato_api_key: null }).eq("id", user.id);
  return NextResponse.json({ success: true });
}
