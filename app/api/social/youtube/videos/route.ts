import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/api/youtube";

export const dynamic = "force-dynamic";

const API = "https://www.googleapis.com/youtube/v3";

/**
 * GET /api/social/youtube/videos — the latest videos on the connected YouTube
 * channel, with title, description and thumbnail (2026-10-25, the owner's
 * ask: start a SparkReels Share Kit from a video already on YouTube). Uses
 * only the read permission the connection already has.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  let token: string;
  try {
    token = await getValidAccessToken(user.id, admin);
  } catch {
    return NextResponse.json({ error: "Connect your YouTube channel in Settings first." }, { status: 400 });
  }
  const auth = { Authorization: `Bearer ${token}` };

  const ch = await fetch(`${API}/channels?part=contentDetails&mine=true`, { headers: auth });
  if (!ch.ok) return NextResponse.json({ error: "Couldn't read your YouTube channel." }, { status: 502 });
  const chJson = (await ch.json()) as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
  const uploads = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return NextResponse.json({ videos: [] });

  const pl = await fetch(`${API}/playlistItems?part=snippet&playlistId=${uploads}&maxResults=25`, { headers: auth });
  if (!pl.ok) return NextResponse.json({ error: "Couldn't list your videos." }, { status: 502 });
  const plJson = (await pl.json()) as {
    items?: { snippet?: { title?: string; description?: string; publishedAt?: string; resourceId?: { videoId?: string }; thumbnails?: Record<string, { url?: string }> } }[];
  };

  const videos = (plJson.items ?? [])
    .map((i) => ({
      videoId: i.snippet?.resourceId?.videoId ?? "",
      title: i.snippet?.title ?? "",
      description: i.snippet?.description ?? "",
      publishedAt: i.snippet?.publishedAt ?? "",
      thumbnail: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? "",
    }))
    .filter((v) => v.videoId && v.title);

  return NextResponse.json({ videos });
}
