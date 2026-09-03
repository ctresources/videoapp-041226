import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Saves an in-progress draft back onto the project without generating a video.
 * The project keeps status "draft" and shows up in My Videos under Drafts so
 * the user can come back and finish later.
 *
 * It used to save four fields — script, CTA, hook, title — and the setup
 * screen's other six choices were React state only. Pick a shape, reorder the
 * photos, choose music, leave, come back, and every one of them was gone with
 * nothing saying so. Photo order matters more than it looks: the render slices
 * the first twelve in grid order.
 *
 * All of them live on ai_script beside the rest, which is the pattern already
 * in use — render_mode and video_platform have round-tripped this way since
 * the editor started reading its defaults back off the project.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    projectId, script, cta, hook, title,
    videoType, photoUrls, musicId, musicUrl, captions, renderMode, lookId,
  } = await req.json() as {
    projectId?: string;
    script?: string;
    cta?: string;
    hook?: string;
    title?: string;
    /** reel_9x16 | youtube_16x9 | youtube_long — the shape picker. */
    videoType?: string;
    /** Photo grid, IN ORDER. The render takes the first twelve of these. */
    photoUrls?: unknown;
    musicId?: string;
    musicUrl?: string | null;
    captions?: boolean;
    renderMode?: string;
    lookId?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, user_id, ai_script")
    .eq("id", projectId)
    .single();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const aiScript = ((project as { ai_script: Record<string, unknown> | null }).ai_script) || {};
  const updatedScript = {
    ...aiScript,
    ...(script !== undefined && { script }),
    ...(cta !== undefined && { cta }),
    ...(hook !== undefined && { hook }),
    // The setup screen's own choices. video_platform is the existing key the
    // editor already reads on load, so the shape rejoins the field it was
    // always meant to live in rather than gaining a second one.
    ...(videoType === "reel_9x16" || videoType === "short_1x1"
      ? { video_platform: "reel", video_length: "standard" }
      : videoType === "youtube_16x9"
        ? { video_platform: "youtube", video_length: "standard" }
        : videoType === "youtube_long"
          ? { video_platform: "youtube", video_length: "long" }
          : {}),
    ...(Array.isArray(photoUrls) && {
      draft_photo_urls: (photoUrls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.startsWith("http"),
      ),
    }),
    ...(musicId !== undefined && { draft_music_id: musicId }),
    ...(musicUrl !== undefined && { draft_music_url: musicUrl }),
    ...(captions !== undefined && { draft_captions: captions }),
    ...(renderMode === "voice_only" || renderMode === "avatar_voice"
      ? { render_mode: renderMode }
      : {}),
    ...(lookId !== undefined && { draft_look_id: lookId }),
    // Marks that these values were saved by the user — the editor prefers them
    // over the resolved default CTA / first suggested hook when reloading.
    user_edited: true,
  };

  const { error } = await admin
    .from("projects")
    .update({ ai_script: updatedScript, ...(title?.trim() ? { title: title.trim() } : {}) })
    .eq("id", projectId);

  if (error) {
    console.error("save-draft update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
