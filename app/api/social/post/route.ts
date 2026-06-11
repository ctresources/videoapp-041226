import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaFromUrl, createPost, type PostTarget, type BlotatoPlatform } from "@/lib/api/blotato";
import { getValidAccessToken, uploadVideoToYouTube } from "@/lib/api/youtube";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

interface PostRequestTarget {
  accountId: string;
  platform: BlotatoPlatform;
  caption?: string;
  title?: string;
  description?: string;
  privacy?: "public" | "unlisted" | "private";
  source?: "native" | "blotato";
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
    project_id: string | null;
    projects: { title: string; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
  } | null;

  const blotatoKey = (profileData as { blotato_api_key: string | null } | null)?.blotato_api_key;

  if (!video?.video_url) return NextResponse.json({ error: "Video not ready" }, { status: 404 });

  const aiScript = video.projects?.ai_script as Record<string, unknown> | null;
  const seoData = video.projects?.seo_data as Record<string, unknown> | null;
  const defaultTitle = String(aiScript?.title || video.projects?.title || "");
  const defaultYouTubeDesc = String(seoData?.youtube_description || aiScript?.description || defaultTitle);
  const defaultCaption = String(seoData?.instagram_caption || aiScript?.hook || defaultTitle);

  const results: Array<{ platform: string; status: string; url?: string }> = [];

  // ── Native YouTube targets ─────────────────────────────────────────────────
  const nativeYouTubeTargets = targets.filter(
    (t) => t.accountId === "native_youtube" || t.source === "native",
  );

  if (nativeYouTubeTargets.length > 0) {
    try {
      const accessToken = await getValidAccessToken(user.id, admin);
      const target = nativeYouTubeTargets[0];

      const result = await uploadVideoToYouTube(accessToken, {
        videoUrl: video.video_url,
        title: target.title || defaultTitle,
        description: target.description || defaultYouTubeDesc,
        privacy: target.privacy || "public",
      });

      await admin.from("social_posts").insert({
        user_id: user.id,
        video_id: videoId,
        platform: "youtube",
        platform_post_id: result.videoId,
        caption: target.description || defaultYouTubeDesc,
        scheduled_at: scheduledAt || null,
        posted_at: scheduledAt ? null : new Date().toISOString(),
        post_status: "published",
      });

      results.push({ platform: "youtube", status: "published", url: result.youtubeUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "YouTube upload failed";
      results.push({ platform: "youtube", status: "failed", url: msg });
    }
  }

  // ── Blotato targets (everything else) ─────────────────────────────────────
  const blotatoTargets = targets.filter(
    (t) => t.accountId !== "native_youtube" && t.source !== "native",
  );

  if (blotatoTargets.length > 0) {
    if (!blotatoKey) {
      return NextResponse.json(
        { error: "Blotato API key not connected. Go to Settings → Social Accounts.", results },
        { status: 400 },
      );
    }

    try {
      const media = await uploadMediaFromUrl(blotatoKey, video.video_url, "video");

      const postTargets: PostTarget[] = blotatoTargets.map((t) => ({
        accountId: t.accountId,
        platform: t.platform,
        title: t.title || defaultTitle,
        description: t.description || defaultYouTubeDesc,
        privacy: t.privacy || "public",
        notifySubscribers: true,
        caption: t.caption || defaultCaption,
        mediaType: "reel" as const,
      }));

      const result = await createPost(blotatoKey, {
        mediaId: media.id,
        targets: postTargets,
        scheduledAt,
      });

      await admin.from("social_posts").insert({
        user_id: user.id,
        video_id: videoId,
        platform: blotatoTargets.map((t) => t.platform).join(","),
        platform_post_id: result.id,
        caption: defaultCaption,
        scheduled_at: scheduledAt || null,
        posted_at: scheduledAt ? null : new Date().toISOString(),
        post_status: scheduledAt ? "scheduled" : "published",
      });

      results.push({
        platform: blotatoTargets.map((t) => t.platform).join(","),
        status: scheduledAt ? "scheduled" : "published",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Blotato post failed";
      results.push({ platform: "blotato", status: "failed", url: msg });
    }
  }

  // Update project status
  if (video.project_id) {
    const allFailed = results.every((r) => r.status === "failed");
    if (!allFailed) {
      await admin.from("projects")
        .update({ status: scheduledAt ? "ready" : "posted" })
        .eq("id", video.project_id);
    }
  }

  const anySuccess = results.some((r) => r.status !== "failed");
  return NextResponse.json({
    success: anySuccess,
    results,
    scheduledAt,
    youtubeUrl: results.find((r) => r.platform === "youtube")?.url,
  });
}
