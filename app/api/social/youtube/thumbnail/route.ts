import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, setVideoThumbnail } from "@/lib/api/youtube";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/social/youtube/thumbnail — { videoId }
 *
 * Puts the project's current thumbnail on a video that is already published.
 *
 * Until now the image was only ever sent as part of the upload, so a thumbnail
 * rebuilt afterwards changed everywhere except the one place it is seen: the
 * app showed the new one, YouTube kept the old one, and the only way to correct
 * that was to upload the whole video again. Replacing a thumbnail is a few
 * hundred kilobytes and one call.
 *
 * Deliberately takes no image: it sends whatever the project currently holds,
 * which is what the window is showing. An endpoint that accepted a URL would
 * be an endpoint that could be asked to put any picture on anyone's channel.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();

  // Scoped to this user on both reads. The video id comes from the browser, so
  // it is a request, not a fact.
  const { data: videoRow } = await admin
    .from("generated_videos")
    .select("project_id")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();
  const projectId = (videoRow as { project_id?: string | null } | null)?.project_id;
  if (!projectId) {
    return NextResponse.json({ error: "No project behind this video" }, { status: 404 });
  }

  const { data: postRow } = await admin
    .from("social_posts")
    .select("metadata")
    .eq("video_id", videoId)
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .eq("status", "published")
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ytId = (postRow as { metadata?: { youtube_video_id?: unknown } } | null)?.metadata?.youtube_video_id;
  if (typeof ytId !== "string" || !ytId) {
    return NextResponse.json({ error: "This video hasn't been published to YouTube yet" }, { status: 400 });
  }

  const { data: proj } = await admin
    .from("projects")
    .select("thumbnail_url, seo_data")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  const pr = proj as { thumbnail_url: string | null; seo_data: { thumbnail_url?: string } | null } | null;
  const thumb = pr?.thumbnail_url || pr?.seo_data?.thumbnail_url;
  if (!thumb || !/^https?:\/\//.test(thumb)) {
    return NextResponse.json({ error: "No thumbnail saved for this video yet" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(user.id, admin);
    await setVideoThumbnail(accessToken, ytId, thumb);
    return NextResponse.json({ success: true });
  } catch (err) {
    /**
     * The expected failure is a channel without phone verification, which
     * YouTube refuses with a 403. It is not a bug and not something a retry
     * fixes, so it is said plainly — the window already offers the download
     * for exactly this case.
     */
    const msg = err instanceof Error ? err.message : "Couldn't update the thumbnail";
    console.warn(`[youtube-thumbnail] ${ytId}: ${msg}`);
    return NextResponse.json(
      {
        error: /403/.test(msg)
          ? "YouTube wouldn't take it — custom thumbnails need a phone-verified channel. Download it and set it in YouTube Studio."
          : "Couldn't update the thumbnail on YouTube",
      },
      { status: 400 },
    );
  }
}
