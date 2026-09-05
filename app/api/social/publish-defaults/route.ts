/**
 * GET /api/social/publish-defaults?videoId=...
 *
 * The title, description, caption, hashtags and thumbnail a video should be
 * published with.
 *
 * These used to be assembled by hand at each call site. My Videos built all
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

export const dynamic = "force-dynamic";

type Script = { hook?: string; script?: string; description?: string; keywords?: string[]; hashtags?: string[] };
type Seo = {
  youtube_title?: string;
  youtube_description?: string;
  hashtags?: string[];
  keywords?: string[];
  instagram_caption?: string;
  thumbnail_url?: string;
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
    .select("id, user_id, metadata, translation_language, projects(title, ai_script, seo_data, thumbnail_url)")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const proj = (video as { projects?: { title?: string; ai_script?: Script; seo_data?: Seo; thumbnail_url?: string } | null }).projects ?? null;
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
  const vidMeta = (video as { metadata?: { publish_title?: string; publish_description?: string } | null }).metadata ?? null;

  return NextResponse.json({
    title: vidMeta?.publish_title || seo.youtube_title || proj?.title || "Untitled Video",
    description: vidMeta?.publish_description || description,
    // The short social blurb — ai_script.description is written to be exactly
    // that. The long YouTube text above is right for YouTube and far too long
    // for an Instagram caption, so the two fields get two texts.
    caption: ai.description || seo.instagram_caption || "",
    tags: seo.hashtags ?? seo.keywords ?? ai.hashtags ?? ai.keywords ?? [],
    thumbnailUrl: proj?.thumbnail_url || seo.thumbnail_url || null,
  });
}
