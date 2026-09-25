/**
 * GET /api/social/publish-defaults?videoId=...
 *
 * The title, description, caption, hashtags and thumbnail a video should be
 * published with.
 *
 * These used to be assembled by hand at each call site. My Content built all
 * seven with a chain of fallbacks; the camera recorder passed an id and a
 * title and nothing else — so the same video published differently depending
 * on which button opened the window, and the camera route's Publish box came
 * up blank. Worse, the server substitutes its own defaults for empty fields,
 * so YouTube received an AI description the user had never been shown.
 *
 * One resolver, so both windows show the same thing, and what is on screen is
 * what gets posted.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectThumbnailUrl } from "@/lib/utils/thumbnail-url";

export const dynamic = "force-dynamic";

type Script = { hook?: string; script?: string; description?: string; keywords?: string[]; hashtags?: string[] };
type Seo = {
  youtube_title?: string;
  youtube_description?: string;
  hashtags?: string[];
  keywords?: string[];
  instagram_caption?: string;
  thumbnail_url?: string;
  thumbnail_headline?: string;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, user_id, project_id, metadata, translation_language")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  /**
   * The project, read on its own rather than embedded.
   *
   * This was a `projects(...)` join, and the fields it returned were only ever
   * fallbacks — the title, description and thumbnail on screen all arrive as
   * props from My Content — so an embed returning nothing looked exactly like
   * an embed working. The photo list has no prop behind it: when the embed
   * came back empty the picker simply never appeared, with no error anywhere.
   *
   * A second lookup on an indexed primary key costs almost nothing and cannot
   * be wrong about its own shape.
   */
  type ProjectRow = {
    title?: string; ai_script?: Script; seo_data?: Seo; thumbnail_url?: string | null;
    listing_data?: Record<string, unknown> | null;
    location_city?: string | null; location_state?: string | null;
  };
  const projectId = (video as { project_id?: string | null }).project_id ?? null;
  let proj: ProjectRow | null = null;
  if (projectId) {
    const { data: projRow, error: projErr } = await admin
      .from("projects")
      .select("title, ai_script, seo_data, thumbnail_url, listing_data, location_city, location_state")
      .eq("id", projectId)
      .single();
    if (projErr) {
      // Loud, because everything downstream degrades quietly into defaults.
      console.error(`[publish-defaults] project ${projectId} lookup failed: ${projErr.message}`);
    }
    proj = (projRow as ProjectRow | null) ?? null;
  }
  // The agent's own headshot, so the thumbnail's person picker can offer it as
  // a tile with a face on it rather than a generic "default" nobody can
  // picture. One indexed read.
  const { data: profRow } = await admin
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  const headshotUrl = (profRow as { avatar_url?: string | null } | null)?.avatar_url ?? null;

  const seo = (proj?.seo_data ?? {}) as Seo;
  const ai = (proj?.ai_script ?? {}) as Script;

  // The SEO step can time out during script generation, leaving the YouTube
  // description empty — so fall through to the script's own description, then
  // to hook + script, and never open on a blank box.
  const description =
    seo.youtube_description ||
    ai.description ||
    [ai.hook, ai.script].filter(Boolean).join("\n\n").slice(0, 4900) ||
    // Last resort, and it is what the photo reels already made need: those
    // have no seo_data and no ai_script at all, so every fallback above is
    // empty and the box opened blank with nothing to publish. The title is
    // always there, and a description is editable — a starting point beats
    // an empty field.
    proj?.title ||
    "";

  /**
   * A dub's own post copy, when it has some.
   *
   * A translation shares the SOURCE project's id — there is no project of its
   * own — so resolving from the project alone uploaded a Spanish video to
   * YouTube with an English title and description. The translate route writes
   * publish_title / publish_description onto the video row, and they win here.
   */
  const vidMeta = (video as { metadata?: { publish_title?: string; publish_description?: string; photo_urls?: string[]; post_processed?: boolean; music_url?: string; stock_clip_urls?: unknown[] } | null }).metadata ?? null;

  /**
   * Whether the extras are still being added.
   *
   * The render finishing and the video finishing are not the same moment. The
   * webhook marks the row completed BEFORE it composites b-roll, mixes music
   * and burns captions — work measured at nearly four minutes — and only then
   * writes post_processed. So a row that says completed with no post_processed
   * is a video whose first watchable version is the bare presenter.
   *
   * That window is exactly when someone publishes, and what reaches YouTube is
   * the version without any of it. No new column for this: the absence of the
   * flag already carries it.
   */
  const hadExtras =
    !!vidMeta?.music_url ||
    (Array.isArray(vidMeta?.stock_clip_urls) && vidMeta!.stock_clip_urls!.length > 0) ||
    (Array.isArray(vidMeta?.photo_urls) && vidMeta!.photo_urls!.length > 0);
  const stillFinishing = hadExtras && !vidMeta?.post_processed;

  /**
   * The photos available as a thumbnail backdrop, best first.
   *
   * The video's own list leads because those are the pictures a viewer just
   * watched — a thumbnail drawn from one of them is a promise the video keeps.
   * The listing's remaining photos follow, so a video that used five of twelve
   * still offers all twelve to choose from.
   */
  const usedPhotos = Array.isArray((vidMeta as { photo_urls?: unknown } | null)?.photo_urls)
    ? ((vidMeta as unknown as { photo_urls: unknown[] }).photo_urls.filter(
        (u): u is string => typeof u === "string" && u.startsWith("http"),
      ))
    : [];
  const listingPhotos = Array.isArray(proj?.listing_data?.photoUrls)
    ? (proj!.listing_data!.photoUrls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.startsWith("http"),
      )
    : [];
  const photos = Array.from(new Set([...usedPhotos, ...listingPhotos])).slice(0, 24);
  console.log(
    `[publish-defaults] video=${videoId} project=${projectId ?? "none"} ` +
    `photos=${photos.length} (video ${usedPhotos.length}, listing ${listingPhotos.length})`,
  );

  /**
   * Already on YouTube? One indexed read on the audit log the upload writes.
   *
   * Newest first because a video can be posted more than once — a re-publish
   * after a fix — and the thumbnail belongs on the copy people are watching.
   */
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
  const youtubeVideoId = typeof ytId === "string" && ytId ? ytId : null;

  return NextResponse.json({
    projectId,
    photos,
    /**
     * True while b-roll, music or captions are still being composited, so the
     * window can say so beside the button rather than letting the plain
     * presenter go out.
     */
    stillFinishing,
    /** True when a PNG has been rendered and saved, so the modal leaves it be. */
    hasStoredThumbnail: !!proj?.thumbnail_url,
    // The market the badge prints, so the field beside it opens showing the
    // truth rather than an empty box the user has to guess at.
    city: proj?.location_city ?? "",
    state: proj?.location_state ?? "",
    headshotUrl,
    // Which cutout this project's thumbnail was last built with, so the picker
    // opens with the right tile marked instead of guessing.
    thumbnailPhotoUrl: typeof (seo as { thumbnail_photo_url?: unknown }).thumbnail_photo_url === "string"
      ? (seo as { thumbnail_photo_url: string }).thumbnail_photo_url
      : null,
    // The words printed on it, so the box that edits them opens showing what
    // is actually on the image. Empty on thumbnails rendered before this was
    // stored — the field then reads as "AI writes it", which is what happens.
    thumbnailHeadline: seo.thumbnail_headline ?? "",
    /**
     * The YouTube id, when this video has already been posted there.
     *
     * A published video's thumbnail can be replaced without re-uploading it,
     * but only if we know which video to replace it on. Without this the
     * window cannot tell a draft from something already public, and rebuilding
     * the image quietly changed it everywhere except on YouTube.
     */
    youtubeVideoId,
    title: vidMeta?.publish_title || seo.youtube_title || proj?.title || "Untitled Video",
    description: vidMeta?.publish_description || description,
    // The short social blurb — ai_script.description is written to be exactly
    // that. The long YouTube text above is right for YouTube and far too long
    // for an Instagram caption, so the two fields get two texts.
    caption: ai.description || seo.instagram_caption || "",
    tags: seo.hashtags ?? seo.keywords ?? ai.hashtags ?? ai.keywords ?? [],
    // The stored PNG if one has been rendered, else the generated card — whose
    // address is derived from the project id rather than read out of seo_data,
    // where it was frozen with the hook inside it at script-writing time.
    thumbnailUrl: proj?.thumbnail_url || (projectId ? projectThumbnailUrl(projectId) : null),
  });
}
