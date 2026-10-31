import { NextRequest, NextResponse } from "next/server";
import { podcastSession } from "@/lib/podcast/session";
import {
  cleanConversation, listCoHosts, PODCAST_MAX_MINUTES, PODCAST_SHORT_VIDEOS, STUDIO_SETS,
  studioBody, studioSetUrl, submitStudioVideo, wordCount, type StudioSetId,
} from "@/lib/podcast/podcast";
import { ALLOWANCE_SELECT, availableFor, chargeOneVideo } from "@/lib/utils/video-allowance";
import { ensureVoiceForRender } from "@/lib/utils/voice-slot";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { getAvatarLooks } from "@/lib/api/heygen";
import { isTwinLook, twinLookIds, type TwinLookFields } from "@/lib/utils/twin-looks";
import { canUseDigitalTwin } from "@/lib/utils/plan-features";
import { hasAdminPerks, staffCapMessage } from "@/lib/utils/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/podcast/make — makes the episode (2026-10-30, Spark Podcast
 * step 1). { title, turns, lookId?, coHostId, setId }
 *
 * One HeyGen studio-mode video: a scene per turn, the host as the agent's own
 * look and cloned voice, the co-host as a ready-made avatar, both on the
 * studio set. Charged PODCAST_SHORT_VIDEOS short videos once HeyGen accepts
 * it, refunded by the usual path if it fails. It lands in My Sparks like any
 * video and is stored by the Direct Video path (render_provider
 * heygen_v3_direct), which burns our captions.
 */
export async function POST(req: NextRequest) {
  const s = await podcastSession();
  if (!s.ok) return s.response;
  const b = (await req.json().catch(() => ({}))) as { title?: string; turns?: unknown; lookId?: string; coHostId?: string; setId?: string };

  let convo;
  try { convo = cleanConversation({ title: b.title, turns: b.turns }); }
  catch { return NextResponse.json({ error: "Write the conversation first." }, { status: 400 }); }
  const words = wordCount(convo.turns);
  if (words > PODCAST_MAX_MINUTES * 150 + 60) {
    return NextResponse.json({ error: `Keep it to about ${PODCAST_MAX_MINUTES} minutes: ${PODCAST_MAX_MINUTES * 150} words at most. It's ${words} now.` }, { status: 400 });
  }

  const { data: profData } = await s.admin.from("profiles")
    .select(`${ALLOWANCE_SELECT}, role, subscription_tier, heygen_voice_id, voice_sample_url, heygen_photo_id, heygen_look_wide, heygen_digital_twin_look_id, heygen_twin2_look_id, twin_outfit_look_ids, twin_consent_needed, twin2_consent_needed, location_city, location_state`)
    .eq("id", s.user.id).single();
  const p = profData as unknown as TwinLookFields & {
    role: string | null; subscription_tier: string | null; heygen_voice_id: string | null; voice_sample_url: string | null;
    heygen_photo_id: string | null; heygen_look_wide: string | null; twin_consent_needed: boolean | null; twin2_consent_needed: boolean | null;
    location_city: string | null; location_state: string | null;
  } | null;
  if (!p) return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  const isAdmin = hasAdminPerks(p.role);
  // A staff account's monthly cap (an episode counts as two).
  const capMsg = await staffCapMessage(s.admin, s.user.id, p.role);
  if (capMsg) return NextResponse.json({ error: capMsg, code: "staff_cap" }, { status: 402 });

  if (!isAdmin && availableFor(p as never, "short") < PODCAST_SHORT_VIDEOS) {
    return NextResponse.json({ error: `An episode uses ${PODCAST_SHORT_VIDEOS} short videos, and you don't have enough left.`, code: "out_of_videos" }, { status: 402 });
  }

  // The host: a look of their own (photo look, twin or outfit), else the wide headshot copy.
  let hostLook = typeof b.lookId === "string" ? b.lookId : "";
  if (hostLook) {
    const own = p.heygen_photo_id ? (await getAvatarLooks(p.heygen_photo_id).catch(() => [])).map((l) => l.id) : [];
    if (!own.includes(hostLook) && !twinLookIds(p).includes(hostLook)) hostLook = "";
  }
  hostLook ||= p.heygen_look_wide ?? "";
  if (!hostLook) return NextResponse.json({ error: "Add your headshot or pick a look first.", code: "no_headshot" }, { status: 409 });
  const twin = isTwinLook(hostLook, p);
  if (twin && !canUseDigitalTwin(p.subscription_tier, p.role)) {
    return NextResponse.json({ error: "Your Digital Twin comes with a paid plan. Pick a photo look." }, { status: 403 });
  }
  if (twin && ((hostLook === p.heygen_twin2_look_id && p.twin2_consent_needed) || (hostLook !== p.heygen_twin2_look_id && p.twin_consent_needed))) {
    return NextResponse.json({ error: "Your Digital Twin needs your one-time approval first. Approve it in Settings.", code: "twin_consent_required" }, { status: 409 });
  }
  const hostVoice = await ensureVoiceForRender({ id: s.user.id, heygen_voice_id: p.heygen_voice_id, voice_sample_url: p.voice_sample_url });
  if (!hostVoice) return NextResponse.json({ error: "Set up your voice in Settings first." }, { status: 409 });

  const coHost = (await listCoHosts()).find((c) => c.id === b.coHostId);
  if (!coHost) return NextResponse.json({ error: "Pick a co-host." }, { status: 400 });
  const setId = (STUDIO_SETS.some((x) => x.id === b.setId) ? b.setId : "warm") as StudioSetId;
  let setUrl: string;
  try { setUrl = await studioSetUrl(s.admin, setId); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't make the studio set." }, { status: 502 }); }

  // The Spark it belongs to, and its video row (the id doubles as HeyGen's idempotency key).
  const script = convo.turns.map((t) => t.text).join(" ");
  const { data: project, error: projErr } = await s.admin.from("projects").insert({
    user_id: s.user.id, title: convo.title, project_type: "location_script", status: "draft",
    ai_script: { kind: "podcast", title: convo.title, hook: "", script, cta: "", description: "", hashtags: [], turns: convo.turns, cohost: { id: coHost.id, name: coHost.name }, set: setId },
  }).select("id").single();
  if (projErr || !project) return NextResponse.json({ error: "Couldn't start the episode." }, { status: 500 });
  const projectId = (project as { id: string }).id;
  const { data: row, error: rowErr } = await s.admin.from("generated_videos").insert({
    project_id: projectId, user_id: s.user.id, video_type: "youtube_16x9",
    render_provider: "heygen_v3_direct", render_status: "rendering",
    metadata: {
      dimension: { width: 1920, height: 1080 }, orientation: "landscape", title: convo.title,
      city: p.location_city, state: p.location_state, captions_enabled: true, is_podcast: true,
    },
  }).select("id, metadata").single();
  if (rowErr || !row) return NextResponse.json({ error: "Couldn't start the episode." }, { status: 500 });
  const videoRowId = (row as { id: string }).id;

  const host = { avatarId: hostLook, voiceId: hostVoice, removeBackground: true };
  const guest = { avatarId: coHost.id, voiceId: coHost.voiceId, removeBackground: true };
  const callbackUrl = buildCallbackUrl();
  let videoId: string;
  try {
    try {
      videoId = await submitStudioVideo(studioBody({ title: convo.title, turns: convo.turns, host, guest, setUrl, callbackUrl, callbackId: videoRowId }), videoRowId);
    } catch (err) {
      // A photo look that can't have its background taken out: the host keeps
      // its own background rather than the episode failing.
      const e = err as { status?: number; body?: string };
      if (e.status !== 400 || !/background|matting/i.test(e.body ?? "")) throw err;
      console.warn("[podcast] host background removal refused; trying without it");
      videoId = await submitStudioVideo(studioBody({ title: convo.title, turns: convo.turns, host: { ...host, removeBackground: false }, guest, setUrl, callbackUrl, callbackId: videoRowId }), `${videoRowId}-b`);
    }
  } catch (err) {
    console.error("[podcast] submit failed:", err instanceof Error ? err.message : err);
    await s.admin.from("generated_videos").update({ render_status: "failed" }).eq("id", videoRowId);
    return NextResponse.json({ error: "The episode couldn't be started. Nothing was charged. Try again." }, { status: 502 });
  }

  // Charged only now that HeyGen has it; recorded so a failure refunds it.
  let source: string | null = null;
  if (!isAdmin) {
    for (let i = 0; i < PODCAST_SHORT_VIDEOS; i++) {
      const c = await chargeOneVideo(s.admin, s.user.id, "short");
      source ??= c?.source ?? null;
    }
  }
  if (twin) {
    const col = hostLook === p.heygen_twin2_look_id ? "twin2_consent_needed" : "twin_consent_needed";
    await s.admin.from("profiles").update({ [col]: false }).eq("id", s.user.id).eq(col, true);
  }
  await s.admin.from("generated_videos").update({
    render_job_id: videoId,
    metadata: {
      ...((row as { metadata: Record<string, unknown> | null }).metadata ?? {}),
      credit_cost: isAdmin ? 0 : PODCAST_SHORT_VIDEOS, credit_kind: "short", credit_source: source ?? "plan",
      heygen_engine: "avatar_iii", is_digital_twin: twin,
    },
  }).eq("id", videoRowId);
  await s.admin.from("api_usage_log").insert({ user_id: s.user.id, api_provider: "heygen", endpoint: "podcast-studio", credits_used: PODCAST_SHORT_VIDEOS, response_status: 202 });

  return NextResponse.json({ videoId: videoRowId, projectId });
}
