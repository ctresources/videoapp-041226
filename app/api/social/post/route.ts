import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaFromUrl, createPost, type PostTarget, type BlotatoPlatform } from "@/lib/api/blotato";
import { NextRequest, NextResponse } from "next/server";

interface PostRequestTarget {
  accountId: string;
  platform: BlotatoPlatform;
  caption?: string;
  title?: string;
  description?: string;
  privacy?: "public" | "unlisted" | "private";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { videoId, targets, scheduledAt } = body as {
    videoId: string;
    targets: PostRequestTarget[];
    scheduledAt?: string;
  };

  if (!videoId || !targets?.length) {
    return NextResponse.json({ error: "videoId and targets required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load video + profile
  const [{ data: videoData }, { data: profileData }] = await Promise.all([
    admin.from("generated_videos")
      .select("*, projects(title, ai_script, seo_data)")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single(),
    admin.from("profiles")
      .select("blotato_api_key")
      .eq("id", user.id)
      .single(),
  ]);

  const video = videoData as {
    video_url: string | null;
    projects: { title: string; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
  } | null;

  const blotatoKey = (profileData as { blotato_api_key: string | null } | null)?.blotato_api_key;

  if (!video?.video_url) return NextResponse.json({ error: "Video not ready" }, { status: 404 });
  if (!blotatoKey) return NextResponse.json({ error: "Blotato API key not connected. Go to Settings → Social Accounts." }, { status: 400 });

  try {
    // Step 1: Upload video to Blotato (they host it for delivery)
    const media = await uploadMediaFromUrl(blotatoKey, video.video_url, "video");

    // Step 2: Build platform targets with AI-generated copy
    const aiScript = video.projects?.ai_script as Record<string, unknown> | null;
    const seoData = video.projects?.seo_data as Record<string, unknown> | null;
    const defaultTitle = String(aiScript?.title || video.projects?.title || "");
    const defaultYouTubeDesc = String(seoData?.youtube_description || aiScript?.description || defaultTitle);
    const defaultCaption = String(seoData?.instagram_caption || aiScript?.hook || defaultTitle);

    const postTargets: PostTarget[] = targets.map((t) => ({
      accountId: t.accountId,
      platform: t.platform,
      // YouTube
      title: t.title || defaultTitle,
      description: t.description || defaultYouTubeDesc,
      privacy: t.privacy || "public",
      notifySubscribers: true,
      // Instagram / TikTok / others
      caption: t.caption || defaultCaption,
      mediaType: "reel" as const,
    }));

    // Step 3: Post via Blotato (handles all platform APIs + OAuth)
    const result = await createPost(blotatoKey, {
      mediaId: media.id,
      targets: postTargets,
      scheduledAt,
    });

    // Step 4: Log in social_posts
    await admin.from("social_posts").insert({
      user_id: user.id,
      video_id: videoId,
      platform: targets.map((t) => t.platform).join(","),
      post_id: result.id,
      caption: defaultCaption,
      posted_at: scheduledAt ? null : new Date().toISOString(),
      status: scheduledAt ? "scheduled" : "published",
      metadata: result as unknown as Record<string, unknown>,
    });

    // Update project status
    const { data: videoRow } = await admin.from("generated_videos").select("project_id").eq("id", videoId).single();
    if (videoRow) {
      await admin.from("projects")
        .update({ status: scheduledAt ? "ready" : "posted" })
        .eq("id", (videoRow as { project_id: string }).project_id);
    }

    return NextResponse.json({ success: true, postId: result.id, scheduledAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Post failed" },
      { status: 500 }
    );
  }
}
