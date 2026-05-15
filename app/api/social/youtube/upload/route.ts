import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, uploadVideoToYouTube } from "@/lib/api/youtube";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min — video download + YouTube upload can be slow

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    videoId: string;
    title: string;
    description?: string;
    privacy?: "public" | "unlisted" | "private";
    tags?: string[];
  };

  if (!body.videoId || !body.title) {
    return NextResponse.json({ error: "videoId and title required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: videoRow } = await admin
    .from("generated_videos")
    .select("video_url, project_id")
    .eq("id", body.videoId)
    .eq("user_id", user.id)
    .single();

  if (!videoRow?.video_url) {
    return NextResponse.json({ error: "Video not ready or not found" }, { status: 404 });
  }

  try {
    const accessToken = await getValidAccessToken(user.id, admin);

    const result = await uploadVideoToYouTube(accessToken, {
      videoUrl: videoRow.video_url,
      title: body.title,
      description: body.description || "",
      privacy: body.privacy || "public",
      tags: body.tags,
    });

    // Log to social_posts for audit
    await admin.from("social_posts").insert({
      user_id: user.id,
      video_id: body.videoId,
      platform: "youtube",
      post_url: result.youtubeUrl,
      caption: body.description || body.title,
      posted_at: new Date().toISOString(),
      status: "published",
      metadata: { youtube_video_id: result.videoId, source: "native_youtube" },
    });

    // Mark project as posted
    if (videoRow.project_id) {
      await admin
        .from("projects")
        .update({ status: "posted" })
        .eq("id", videoRow.project_id);
    }

    return NextResponse.json({ success: true, videoId: result.videoId, youtubeUrl: result.youtubeUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "YouTube upload failed";
    console.error("[youtube-upload] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
