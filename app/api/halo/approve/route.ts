import { NextRequest, NextResponse } from "next/server";
import { haloSession } from "@/lib/halo/session";
import { startRender } from "@/lib/video/start-render";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { joinHookAndScript } from "@/lib/utils/script-assembly";
import type { HaloSetup } from "@/lib/halo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/halo/approve { draftId } — make this Halo video.
 *
 * Starts the render exactly as the editor's Spark Video button does
 * (lib/video/start-render), with this draft's setup: look, avatar, size,
 * captions, music, and what is on screen. It is charged to the plan then, like
 * any video. Once it is finished, the halo-post job posts it on its day to the
 * accounts chosen (lib/halo/post.ts).
 *
 * Refusals come back as start-render gives them (out of videos, no headshot,
 * Digital Twin approval …), so the page can say what to do.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };

  const { data } = await s.admin
    .from("autopilot_drafts")
    .select("id, status, source, setup, project_id")
    .eq("id", draftId ?? "")
    .eq("user_id", s.user.id)
    .single();
  const d = data as { id: string; status: string; source: string; setup: HaloSetup; project_id: string | null } | null;
  if (!d || !["halo", "halo_promo", "email"].includes(d.source)) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (d.status !== "draft") return NextResponse.json({ error: d.status === "writing" ? "Still writing. Try again in a minute." : "This one is already approved." }, { status: 409 });
  if (!d.project_id) return NextResponse.json({ error: "Still writing. Try again in a minute." }, { status: 409 });

  /**
   * A video already made from this draft (2026-10-24, Daniel Okiro's draft):
   * he made it from Setup → the editor, then pressed Approve, which made and
   * charged a second identical one, and the posting job would have posted that
   * one again. Now a video that is finished or still being made is used as it
   * is: no new video, nothing charged. The posting job sends it on its day to
   * the accounts it isn't on yet. A failed one is ignored and a new one made.
   */
  const { data: made } = await s.admin
    .from("generated_videos")
    .select("id, render_status")
    .eq("project_id", d.project_id)
    .eq("user_id", s.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = made as { id: string; render_status: string | null } | null;
  if (existing && existing.render_status !== "failed") {
    await s.admin.from("autopilot_drafts").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      video_id: existing.id,
      post_error: null,
    }).eq("id", d.id);
    return NextResponse.json({ ok: true, reused: true, ready: existing.render_status === "completed" });
  }

  const { data: proj } = await s.admin.from("projects").select("ai_script").eq("id", d.project_id).single();
  const ai = ((proj as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {};
  const hook = String(ai.hook ?? "");
  const script = joinHookAndScript(hook, String(ai.script ?? ""));
  const cta = String(ai.cta ?? "");
  if (!script.trim()) return NextResponse.json({ error: "This draft has no script. Open it to write one." }, { status: 400 });

  const setup = d.setup;
  const vertical = setup.size !== "horizontal";
  const circle = setup.look === "circle";

  // The avatar: the one chosen, else the headshot copy shaped for this video.
  let lookId = setup.lookId;
  if (!lookId) {
    const { data: prof } = await s.admin.from("profiles").select("heygen_look_wide, heygen_look_tall").eq("id", s.user.id).single();
    const p = prof as { heygen_look_wide: string | null; heygen_look_tall: string | null } | null;
    lookId = (vertical ? p?.heygen_look_tall : p?.heygen_look_wide) ?? p?.heygen_look_tall ?? p?.heygen_look_wide ?? null;
  }

  // Music: the preset's catalog search, resolved now (its links expire).
  let musicUrl: string | undefined;
  const preset = MUSIC_PRESETS.find((m) => m.id === setup.music);
  if (preset?.query) {
    try { musicUrl = (await searchBackgroundMusic(preset.query, 1))[0]?.audio_url; }
    catch (err) { console.warn("[halo/approve] music:", err instanceof Error ? err.message : err); }
  }

  const res = await startRender(s.user, {
    projectId: d.project_id,
    videoType: vertical ? "reel_9x16" : "youtube_16x9",
    longForm: false,
    captions: setup.captions !== false,
    ...(musicUrl && { musicUrl }),
    backgroundMode: "stock-video",
    script,
    cta,
    hook,
    ...(circle && { engine: "direct" }),
    avatarStyle: circle ? "circle" : "full",
    renderMode: "avatar_voice",
    ...(lookId && { lookId }),
    ...(setup.onScreen === "post" && setup.photos?.length && { extraPhotoUrls: setup.photos }),
  });

  const out = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status >= 400) return NextResponse.json(out, { status: res.status });

  await s.admin.from("autopilot_drafts").update({
    status: "approved",
    approved_at: new Date().toISOString(),
    // A failed earlier video may be noted here; the posting job finds the new one.
    video_id: null,
    post_error: null,
  }).eq("id", d.id);
  return NextResponse.json({ ok: true, queued: res.status === 202 });
}
