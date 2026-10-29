import { getAvatarLooks } from "@/lib/api/heygen";
import { twinLookIds, type TwinLookFields } from "@/lib/utils/twin-looks";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { loadQuickPicks } from "@/lib/api/boldtrail-picks";
import { makeDraftVideo } from "@/lib/halo/make";
import { WPM } from "@/lib/utils/video-length";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Avatar in circle is held to a minute (2026-10-27, the owner's ask). */
const AVATAR_MAX_SECONDS = 60;
const REVIEW_AVATAR_MAX_WORDS = Math.floor((AVATAR_MAX_SECONDS * WPM) / 60);

/**
 * Ask for Google Review Video Email (2026-10-27).
 *
 * POST { action: "load" }  the review link, whether BoldTrail is connected,
 *        quick picks, the sign-off, and the agent's recent finished videos
 * POST { action: "avatar", script }  makes an Avatar in circle video (up to
 *        60 seconds) from the words; uses one short video
 * POST { action: "video", projectId }  that video's progress
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; script?: string; projectId?: string; videoId?: string; lookId?: string };

  if (body.action === "load") {
    const [{ data: prof }, token, signature, { data: vids }] = await Promise.all([
      admin.from("profiles").select("google_review_url").eq("id", user.id).single(),
      loadBoldTrailToken(admin, user.id),
      loadAgentSignature(admin, user.id),
      admin.from("generated_videos")
        .select("id, video_url, created_at, duration_seconds, projects(title, thumbnail_url)")
        .eq("user_id", user.id).eq("render_status", "completed").not("video_url", "is", null)
        .order("created_at", { ascending: false }).limit(12),
    ]);
    const picks = token ? await loadQuickPicks(admin, user.id).catch(() => []) : [];
    return NextResponse.json({
      reviewUrl: (prof as { google_review_url: string | null } | null)?.google_review_url ?? null,
      boldtrail: !!token,
      picks,
      signature,
      videos: ((vids ?? []) as unknown as { id: string; video_url: string; created_at: string; duration_seconds: number | null; projects: { title: string | null; thumbnail_url: string | null } | null }[])
        .map((v) => ({ id: v.id, url: v.video_url, createdAt: v.created_at, seconds: v.duration_seconds, title: v.projects?.title ?? "Video", thumbnail: v.projects?.thumbnail_url ?? null })),
    });
  }

  if (body.action === "avatar") {
    const script = (body.script ?? "").trim().replace(/\s+/g, " ").slice(0, 2000);
    const words = script.split(" ").filter(Boolean).length;
    if (words < 8) return NextResponse.json({ error: "Write a few sentences for the video first." }, { status: 400 });
    if (words > REVIEW_AVATAR_MAX_WORDS) {
      return NextResponse.json({ error: `Keep it to about a minute: ${REVIEW_AVATAR_MAX_WORDS} words at most. It's ${words} now.` }, { status: 400 });
    }
    const title = "Google review request";
    const { data: project, error } = await admin.from("projects").insert({
      user_id: user.id, title, project_type: "location_script", status: "draft",
      ai_script: { title, hook: "", script, cta: "", description: "", hashtags: [], kind: "review_request" },
    }).select("id").single();
    if (error || !project) return NextResponse.json({ error: "Couldn't start the video. Try again." }, { status: 500 });
    const projectId = (project as { id: string }).id;
    /**
     * The photo or avatar picked for the circle (2026-10-29, the owner's ask),
     * only if it's this account's own: a photo look, a twin or its outfit.
     * Anything else, or nothing, is the headshot as before.
     */
    let lookId: string | null = null;
    const asked = typeof body.lookId === "string" ? body.lookId : "";
    if (asked) {
      const { data: prof } = await admin.from("profiles")
        .select("heygen_photo_id, heygen_digital_twin_look_id, heygen_twin2_look_id, twin_outfit_look_ids")
        .eq("id", user.id).single();
      const p = prof as { heygen_photo_id: string | null } & TwinLookFields | null;
      const own = p?.heygen_photo_id ? (await getAvatarLooks(p.heygen_photo_id).catch(() => [])).map((l) => l.id) : [];
      if (own.includes(asked) || twinLookIds(p).includes(asked)) lookId = asked;
    }
    const made = await makeDraftVideo(admin, { id: user.id, email: user.email ?? null }, {
      id: projectId,
      project_id: projectId,
      setup: { look: "circle", lookId, size: "horizontal", picture: "ai", pictureUrl: null, onScreen: "stock", photos: [], platforms: [], captions: true, music: "none" },
    });
    if (made.status >= 400) return NextResponse.json(made.out, { status: made.status });
    return NextResponse.json({ projectId });
  }

  if (body.action === "video") {
    const { data } = await admin.from("generated_videos")
      .select("id, render_status, video_url, duration_seconds")
      .eq("project_id", body.projectId ?? "").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const v = data as { id: string; render_status: string | null; video_url: string | null; duration_seconds: number | null } | null;
    if (!v) return NextResponse.json({ status: "starting" });
    return NextResponse.json({
      status: v.render_status === "completed" && v.video_url ? "ready" : v.render_status === "failed" ? "failed" : "making",
      video: v.video_url ? { id: v.id, url: v.video_url, seconds: v.duration_seconds } : null,
    });
  }

  /**
   * POST { action: "mark", videoId } (2026-10-29): a camera take or photo reel
   * made in this tool is a review request too, like the avatar one: no
   * Publish to socials, and Email it adds the review button to begin with.
   * Only a video of this account's, and only one made in the last 3 hours.
   */
  if (body.action === "mark") {
    const videoId = (body as { videoId?: string }).videoId ?? "";
    const { data: v } = await admin.from("generated_videos")
      .select("project_id, created_at").eq("id", videoId).eq("user_id", user.id).maybeSingle();
    const row = v as { project_id: string | null; created_at: string } | null;
    if (!row?.project_id || Date.now() - Date.parse(row.created_at) > 3 * 3600_000) return NextResponse.json({ ok: false });
    const { data: proj } = await admin.from("projects").select("ai_script").eq("id", row.project_id).eq("user_id", user.id).maybeSingle();
    const ai = { ...(((proj as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {}), kind: "review_request" };
    await admin.from("projects").update({ ai_script: ai }).eq("id", row.project_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
