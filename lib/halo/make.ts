import type { createAdminClient } from "@/lib/supabase/admin";
import { startRender } from "@/lib/video/start-render";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { joinHookAndScript } from "@/lib/utils/script-assembly";
import type { HaloSetup } from "@/lib/halo";
import { planCinematicScenes, startCinematicAvatar } from "@/lib/video/cinematic-avatar-start";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Makes the video for a saved Spark from its script and a setup, as the
 * editor's Spark Video button does (lib/video/start-render). Charged like any
 * video, through the same render queue and plan limits.
 *
 * Shared by drafts (makeDraftVideo below) and the agent layer's make_video
 * (2026-11-22): one way to turn a saved Spark into a render.
 */
export async function renderSparkVideo(
  admin: Admin,
  user: { id: string; email: string | null },
  projectId: string,
  setup: HaloSetup,
  /** The Remake button: lets a second video past the one-per-draft rule. */
  opts: { remake?: boolean; visualDirection?: string } = {},
): Promise<{ status: number; out: Record<string, unknown> }> {
  const { data: proj } = await admin.from("projects").select("ai_script").eq("id", projectId).eq("user_id", user.id).single();
  const ai = ((proj as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {};
  const hook = String(ai.hook ?? "");
  const script = joinHookAndScript(hook, String(ai.script ?? ""));
  const cta = String(ai.cta ?? "");
  if (!script.trim()) return { status: 400, out: { error: "This draft has no script. Open it to write one." } };

  // A draft with no size saved is horizontal (2026-11-12, was vertical).
  const vertical = setup.size === "vertical";
  const voiceOnly = setup.voiceOnly === true;
  const circle = !voiceOnly && setup.look === "circle";

  // The avatar: the one chosen, else the headshot copy shaped for this video.
  let lookId = setup.lookId;
  if (!lookId) {
    const { data: prof } = await admin.from("profiles").select("heygen_look_wide, heygen_look_tall").eq("id", user.id).single();
    const p = prof as { heygen_look_wide: string | null; heygen_look_tall: string | null } | null;
    lookId = (vertical ? p?.heygen_look_tall : p?.heygen_look_wide) ?? p?.heygen_look_tall ?? p?.heygen_look_wide ?? null;
  }

  // Music: the preset's catalog search, resolved now (its links expire).
  let musicUrl: string | undefined;
  const preset = MUSIC_PRESETS.find((m) => m.id === setup.music);
  if (preset?.query) {
    try { musicUrl = (await searchBackgroundMusic(preset.query, 1))[0]?.audio_url; }
    catch (err) { console.warn("[halo/make] music:", err instanceof Error ? err.message : err); }
  }

  const res = await startRender(user, {
    projectId,
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
    renderMode: voiceOnly ? "voice_only" : "avatar_voice",
    ...(lookId && !voiceOnly && { lookId }),
    ...(setup.onScreen === "post" && setup.photos?.length && { extraPhotoUrls: setup.photos }),
    ...(opts.remake && { remake: true }),
    ...(opts.visualDirection && { visualDirection: opts.visualDirection }),
  });

  const out = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status >= 400) return { status: res.status, out };
  return { status: 200, out: { ok: true, made: true, ready: false, queued: res.status === 202, ...out } };
}

/**
 * A Cinematic AI Avatar video for a saved Spark (2026-11-25, AI apps): the
 * script and closing line cut into scenes with a place for each, then built
 * by the same code as the editor's tile (lib/video/cinematic-avatar-start).
 * Music is the chosen preset, Inspiring when none is chosen (the owner's
 * ask). The caller's function must allow 800 seconds.
 */
export async function renderSparkCinematic(
  admin: Admin,
  user: { id: string },
  projectId: string,
  setup: HaloSetup,
): Promise<{ status: number; out: Record<string, unknown> }> {
  const { data: proj } = await admin.from("projects").select("ai_script, location_city").eq("id", projectId).eq("user_id", user.id).single();
  const row = proj as { ai_script: Record<string, unknown> | null; location_city: string | null } | null;
  const ai = row?.ai_script ?? {};
  const spoken = [joinHookAndScript(String(ai.hook ?? ""), String(ai.script ?? "")), String(ai.cta ?? "").trim()].filter(Boolean).join("\n\n");
  if (!spoken.trim()) return { status: 400, out: { error: "This draft has no script. Open it to write one." } };

  const plan = await planCinematicScenes(user, { script: spoken, town: row?.location_city ?? undefined });
  if (plan.status >= 400) return { status: plan.status, out: plan.body };

  let musicUrl: string | null = null;
  const preset = MUSIC_PRESETS.find((m) => m.id === (setup.music || "inspiring"));
  if (preset?.query) {
    try { musicUrl = (await searchBackgroundMusic(preset.query, 1))[0]?.audio_url ?? null; }
    catch (err) { console.warn("[halo/make] cinematic music:", err instanceof Error ? err.message : err); }
  }

  const r = await startCinematicAvatar(user, {
    projectId,
    scenes: plan.body.scenes as { line: string; place: string }[],
    format: setup.size === "vertical" ? "reel_9x16" : "youtube_16x9",
    captions: setup.captions !== false,
    musicUrl,
    lookId: setup.lookId ?? null,
  });
  if (r.status >= 400) return { status: r.status, out: r.body };
  return { status: 200, out: { ok: true, made: true, ready: false, queued: false, scenes: (plan.body.scenes as unknown[]).length, ...r.body } };
}

/**
 * Makes the video for one draft with the draft's setup. The draft stays a
 * draft: nothing posts until it is approved.
 *
 * Moved out of /api/halo/approve (2026-10-26) so a Sparklee draft can be made
 * in the background right after it's written.
 */
export async function makeDraftVideo(
  admin: Admin,
  user: { id: string; email: string | null },
  d: { id: string; setup: HaloSetup; project_id: string },
  opts: { remake?: boolean } = {},
): Promise<{ status: number; out: Record<string, unknown> }> {
  const r = await renderSparkVideo(admin, user, d.project_id, d.setup, opts);
  if (r.status >= 400) return r;
  await admin.from("autopilot_drafts").update({ post_error: null }).eq("id", d.id);
  return { status: 200, out: { ok: true, made: true, ready: false, queued: r.out.queued === true } };
}
