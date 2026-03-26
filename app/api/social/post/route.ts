import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToYouTube, refreshYouTubeToken } from "@/lib/api/social/youtube";
import { postToInstagram } from "@/lib/api/social/instagram";
import { postToTikTok } from "@/lib/api/social/tiktok";
import { decryptToken } from "@/lib/utils/encrypt";
import { NextRequest, NextResponse } from "next/server";

interface SocialAccount {
  id: string;
  platform: string;
  platform_user_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  is_active: boolean;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { videoId, platforms, caption, title, description, tags, privacyStatus } = body as {
    videoId: string;
    platforms: string[];
    caption: string;
    title: string;
    description: string;
    tags: string[];
    privacyStatus?: "public" | "unlisted" | "private";
  };

  if (!videoId || !platforms?.length) {
    return NextResponse.json({ error: "videoId and platforms required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load video
  const { data: videoData } = await admin
    .from("generated_videos")
    .select("*, projects(title, ai_script, seo_data)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!videoData || !videoData.video_url) {
    return NextResponse.json({ error: "Video not found or not yet rendered" }, { status: 404 });
  }

  const video = videoData as {
    id: string;
    video_url: string;
    projects: { title: string; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
  };

  // Load connected social accounts
  const { data: accounts } = await admin
    .from("social_accounts")
    .select("*")
    .eq("user_id", user.id)
    .in("platform", platforms)
    .eq("is_active", true);

  const results: Record<string, { success: boolean; url?: string; error?: string }> = {};

  for (const account of (accounts as SocialAccount[]) || []) {
    try {
      let accessToken = await decryptToken(account.access_token_enc);

      // Refresh YouTube token if expired
      if (account.platform === "youtube" && account.token_expires_at) {
        const expiresAt = new Date(account.token_expires_at).getTime();
        if (Date.now() > expiresAt - 5 * 60 * 1000 && account.refresh_token_enc) {
          const refreshToken = await decryptToken(account.refresh_token_enc);
          accessToken = await refreshYouTubeToken(refreshToken);
          // Update stored token
          const { encryptToken } = await import("@/lib/utils/encrypt");
          await admin.from("social_accounts").update({
            access_token_enc: await encryptToken(accessToken),
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          }).eq("id", account.id);
        }
      }

      const videoTitle = title || (video.projects?.title) || "Real Estate Video";
      const videoDesc = description || String((video.projects?.seo_data as Record<string, unknown> | null)?.youtube_description || videoTitle);
      const videoTags = tags || ((video.projects?.ai_script as Record<string, unknown> | null)?.keywords as string[]) || [];

      if (account.platform === "youtube") {
        const result = await uploadToYouTube(accessToken, {
          videoUrl: video.video_url,
          title: videoTitle,
          description: videoDesc,
          tags: videoTags,
          privacyStatus: privacyStatus || "public",
        });
        results.youtube = { success: true, url: result.video_url };

        // Save post record
        await admin.from("social_posts").insert({
          user_id: user.id,
          video_id: videoId,
          platform: "youtube",
          social_account_id: account.id,
          post_id: result.video_id,
          post_url: result.video_url,
          caption: videoDesc,
          posted_at: new Date().toISOString(),
          status: "published",
        });
      }

      if (account.platform === "instagram") {
        const igUserId = account.platform_user_id;
        const result = await postToInstagram(accessToken, igUserId, {
          videoUrl: video.video_url,
          caption: caption || String((video.projects?.seo_data as Record<string, unknown> | null)?.instagram_caption || videoTitle),
          mediaType: "REELS",
        });
        results.instagram = { success: true, url: result.post_url };

        await admin.from("social_posts").insert({
          user_id: user.id,
          video_id: videoId,
          platform: "instagram",
          social_account_id: account.id,
          post_id: result.post_id,
          post_url: result.post_url,
          caption: caption || "",
          posted_at: new Date().toISOString(),
          status: "published",
        });
      }

      if (account.platform === "tiktok") {
        const result = await postToTikTok(accessToken, {
          videoUrl: video.video_url,
          title: caption || videoTitle,
          description: videoDesc,
        });
        results.tiktok = { success: true };

        await admin.from("social_posts").insert({
          user_id: user.id,
          video_id: videoId,
          platform: "tiktok",
          social_account_id: account.id,
          post_id: result.publish_id,
          caption: caption || "",
          posted_at: new Date().toISOString(),
          status: "published",
        });
      }
    } catch (err) {
      results[account.platform] = {
        success: false,
        error: err instanceof Error ? err.message : "Post failed",
      };
    }
  }

  // Update project status
  const anySuccess = Object.values(results).some((r) => r.success);
  if (anySuccess) {
    const { data: videoRow } = await admin.from("generated_videos").select("project_id").eq("id", videoId).single();
    if (videoRow) {
      await admin.from("projects").update({ status: "posted" }).eq("id", (videoRow as { project_id: string }).project_id);
    }
  }

  return NextResponse.json({ results });
}
