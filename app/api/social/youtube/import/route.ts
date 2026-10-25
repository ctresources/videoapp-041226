import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/api/youtube";

export const dynamic = "force-dynamic";

const API = "https://www.googleapis.com/youtube/v3";

/**
 * POST /api/social/youtube/import — { videoId } (2026-10-25, the owner's ask).
 *
 * Starts a SparkReels project from a video already on the connected YouTube
 * channel: its title and description become the project's copy, so the Share
 * Kit can write the LinkedIn, Facebook and Instagram posts from them. The
 * video file itself is not copied (YouTube does not allow that), so the blog
 * waits for the caption permission.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = (await req.json().catch(() => ({}))) as { videoId?: string };
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let token: string;
  try {
    token = await getValidAccessToken(user.id, admin);
  } catch {
    return NextResponse.json({ error: "Connect your YouTube channel in Settings first." }, { status: 400 });
  }

  const res = await fetch(`${API}/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return NextResponse.json({ error: "Couldn't read that video." }, { status: 502 });
  const data = (await res.json()) as { items?: { snippet?: { title?: string; description?: string; channelId?: string } }[] };
  const snip = data.items?.[0]?.snippet;
  if (!snip?.title) return NextResponse.json({ error: "That video isn't on your channel." }, { status: 404 });

  const title = snip.title.trim().slice(0, 200);
  const description = (snip.description ?? "").trim();

  const { data: row, error } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      project_type: "youtube_import",
      status: "draft",
      ai_script: {
        title,
        // The description stands in for the words until captions are allowed.
        script: description,
        hook: "",
        cta: "",
        keywords: [],
        imported_from: { source: "youtube", videoId },
      },
      seo_data: {
        meta_title: title,
        meta_description: description.slice(0, 160),
        youtube_title: title,
        youtube_description: description,
        hashtags: [],
        keywords: [],
        source: "youtube",
        youtube_video_id: videoId,
      },
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("[youtube/import] project insert failed:", error?.message);
    return NextResponse.json({ error: "Couldn't start the project. Try again." }, { status: 500 });
  }

  return NextResponse.json({ projectId: (row as { id: string }).id });
}
