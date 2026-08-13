import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaFromUrl, createPost, type PostTarget, type BlotatoPlatform } from "@/lib/api/blotato";
import { getValidAccessToken, uploadVideoToYouTube, setVideoThumbnail } from "@/lib/api/youtube";
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
      .select("*, projects(title, ai_script, seo_data, thumbnail_url)")
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
    projects: { title: string; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null; thumbnail_url: string | null } | null;
  } | null;

  const blotatoKey = (profileData as { blotato_api_key: string | null } | null)?.blotato_api_key;

  if (!video?.video_url) return NextResponse.json({ error: "Video not ready" }, { status: 404 });

  const aiScript = video.projects?.ai_script as Record<string, unknown> | null;
  const seoData = video.projects?.seo_data as Record<string, unknown> | null;
  const defaultTitle = String(aiScript?.title || video.projects?.title || "");
  const defaultYouTubeDesc = String(seoData?.youtube_description || aiScript?.description || defaultTitle);
  const defaultCaption = String(seoData?.instagram_caption || aiScript?.hook || defaultTitle);

  // `error` is its own field rather than riding in `url`. The failure message
  // used to be stuffed into `url`, where the client could not tell a post link
  // apart from an error string — so it surfaced neither.
  const results: Array<{ platform: string; status: string; url?: string; error?: string }> = [];

  // Whether the project's generated thumbnail actually landed on YouTube.
  // Reported back rather than promised up front: setting a custom thumbnail
  // needs a phone-verified channel, and when it fails the Publish window has
  // to tell the user to set it by hand instead of silently showing nothing.
  let thumbnailSet = false;

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

      // Apply the project's generated thumbnail. Non-fatal by design: a
      // channel without phone verification cannot take a custom thumbnail,
      // and that must not fail an otherwise successful upload.
      const thumb = video.projects?.thumbnail_url
        || (video.projects?.seo_data as { thumbnail_url?: string } | null)?.thumbnail_url;
      if (thumb && /^https?:\/\//.test(thumb)) {
        try {
          await setVideoThumbnail(accessToken, result.videoId, thumb);
          thumbnailSet = true;
        } catch (err) {
          console.warn(
            "[social/post] YouTube thumbnail set failed (channel may need phone verification):",
            err instanceof Error ? err.message : err,
          );
        }
      }

      // post_status must be one of scheduled/posting/posted/failed — the table's
      // CHECK constraint. This said "published", which is not in that list, so
      // EVERY insert threw. Because the insert runs after a successful upload,
      // the video reached YouTube and was then reported as a failure, and
      // social_posts stayed permanently empty.
      const { error: logErr } = await admin.from("social_posts").insert({
        user_id: user.id,
        video_id: videoId,
        platform: "youtube",
        platform_post_id: result.videoId,
        caption: target.description || defaultYouTubeDesc,
        scheduled_at: scheduledAt || null,
        posted_at: scheduledAt ? null : new Date().toISOString(),
        post_status: "posted",
      });
      // The upload already happened. A bookkeeping failure must never be
      // reported as a failed post — that is the mistake this whole branch made.
      if (logErr) {
        console.error(`[social/post] YouTube upload succeeded but logging failed: ${logErr.message}`);
      }

      results.push({ platform: "youtube", status: "published", url: result.youtubeUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "YouTube upload failed";
      console.error("[social/post] YouTube upload failed:", msg);
      results.push({ platform: "youtube", status: "failed", error: msg });
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
        post_status: scheduledAt ? "scheduled" : "posted",
      });

      results.push({
        platform: blotatoTargets.map((t) => t.platform).join(","),
        status: scheduledAt ? "scheduled" : "published",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Blotato post failed";
      console.error("[social/post] Blotato post failed:", msg);
      results.push({ platform: "blotato", status: "failed", error: msg });
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
  const youtubePublished = results.some((r) => r.platform === "youtube" && r.status === "published");

  // A 200 with success:false was indistinguishable from a win to any client
  // that only checks res.ok — which is exactly what the Publish window did, so
  // a failed upload rendered as "Published!". When nothing got through, say so
  // in the status code and put the first real reason in `error`.
  const status = anySuccess ? 200 : 502;
  const firstError = results.find((r) => r.status === "failed")?.error;

  return NextResponse.json({
    success: anySuccess,
    ...(anySuccess ? {} : { error: firstError || "Nothing could be published." }),
    results,
    scheduledAt,
    youtubeUrl: results.find((r) => r.platform === "youtube" && r.status === "published")?.url,
    // Only meaningful when YouTube was actually published to; null elsewhere so
    // the client can tell "didn't apply" apart from "wasn't attempted".
    thumbnailSet: youtubePublished ? thumbnailSet : null,
  }, { status });
}
