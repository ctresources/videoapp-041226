import type { createAdminClient } from "@/lib/supabase/admin";
import { startRender } from "@/lib/video/start-render";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { joinHookAndScript } from "@/lib/utils/script-assembly";
import type { HaloSetup } from "@/lib/halo";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Makes the video for one draft, as the editor's Spark Video button does
 * (lib/video/start-render), with the draft's setup. Charged like any video.
 * The draft stays a draft: nothing posts until it is approved.
 *
 * Moved out of /api/halo/approve (2026-10-26) so a Sparklee draft can be made
 * in the background right after it's written.
 */
export async function makeDraftVideo(
  admin: Admin,
  user: { id: string; email: string | null },
  d: { id: string; setup: HaloSetup; project_id: string },
  /** The Remake button: lets a second video past the one-per-draft rule. */
  opts: { remake?: boolean } = {},
): Promise<{ status: number; out: Record<string, unknown> }> {
  const { data: proj } = await admin.from("projects").select("ai_script").eq("id", d.project_id).single();
  const ai = ((proj as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {};
  const hook = String(ai.hook ?? "");
  const script = joinHookAndScript(hook, String(ai.script ?? ""));
  const cta = String(ai.cta ?? "");
  if (!script.trim()) return { status: 400, out: { error: "This draft has no script. Open it to write one." } };

  const setup = d.setup;
  const vertical = setup.size !== "horizontal";
  const circle = setup.look === "circle";

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
    ...(opts.remake && { remake: true }),
  });

  const out = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status >= 400) return { status: res.status, out };

  await admin.from("autopilot_drafts").update({ post_error: null }).eq("id", d.id);
  return { status: 200, out: { ok: true, made: true, ready: false, queued: res.status === 202 } };
}
