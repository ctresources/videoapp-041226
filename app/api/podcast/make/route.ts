import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { podcastSession } from "@/lib/podcast/session";
import {
  cleanConversation, listCoHosts, PODCAST_MAX_MINUTES, PODCAST_LONG_VIDEOS, STUDIO_SETS,
  studioBody, studioSetUrl, submitStudioVideo, wordCount, type StudioSetId,
} from "@/lib/podcast/podcast";
import { startDeskEpisode, type DeskRecord } from "@/lib/podcast/desk";
import { PARTNER_PREFIX, resolvePartnerCoHost } from "@/lib/podcast/partners";
import { ALLOWANCE_SELECT, availableFor, chargeOneVideo } from "@/lib/utils/video-allowance";
import { ensureVoiceForRender } from "@/lib/utils/voice-slot";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { getAvatarLooks } from "@/lib/api/heygen";
import { isTwinLook, twinLookIds, type TwinLookFields } from "@/lib/utils/twin-looks";
import { canUseDigitalTwin } from "@/lib/utils/plan-features";
import { hasAdminPerks, staffCapMessage } from "@/lib/utils/roles";

export const dynamic = "force-dynamic";
// The desk layout speaks every line and starts two renders after answering.
export const maxDuration = 800;

/**
 * POST /api/podcast/make — makes the episode. { title, turns, lookId?,
 * coHostId, setId, layout? }
 *
 * layout "desk" (the default since 2026-11-02, the owner's pick): both people
 * side by side at a desk, cutting to close-ups; built by lib/podcast/desk.ts.
 * layout "studio": the first version, one HeyGen studio-mode video that cuts
 * between the two, one person on screen at a time.
 *
 * The co-host is a ready-made avatar or a partner who allowed it
 * ("partner:<id>"). Either way an episode uses one long video
 * (2026-11-02, was two short), charged once HeyGen accepts it and refunded
 * if it fails.
 */
export async function POST(req: NextRequest) {
  const s = await podcastSession();
  if (!s.ok) return s.response;
  const b = (await req.json().catch(() => ({}))) as { title?: string; turns?: unknown; lookId?: string; coHostId?: string; setId?: string; layout?: string };
  const layout = b.layout === "studio" ? "studio" : "desk";

  let convo;
  try { convo = cleanConversation({ title: b.title, turns: b.turns }); }
  catch { return NextResponse.json({ error: "Write the conversation first." }, { status: 400 }); }
  const words = wordCount(convo.turns);
  if (words > PODCAST_MAX_MINUTES * 150 + 60) {
    return NextResponse.json({ error: `Keep it to about ${PODCAST_MAX_MINUTES} minutes: ${PODCAST_MAX_MINUTES * 150} words at most. It's ${words} now.` }, { status: 400 });
  }

  const { data: profData } = await s.admin.from("profiles")
    .select(`${ALLOWANCE_SELECT}, role, subscription_tier, full_name, heygen_voice_id, voice_sample_url, heygen_photo_id, heygen_look_wide, heygen_digital_twin_look_id, heygen_twin2_look_id, twin_outfit_look_ids, twin_consent_needed, twin2_consent_needed, location_city, location_state`)
    .eq("id", s.user.id).single();
  const p = profData as unknown as TwinLookFields & {
    role: string | null; subscription_tier: string | null; full_name: string | null; heygen_voice_id: string | null; voice_sample_url: string | null;
    heygen_photo_id: string | null; heygen_look_wide: string | null; twin_consent_needed: boolean | null; twin2_consent_needed: boolean | null;
    location_city: string | null; location_state: string | null;
  } | null;
  if (!p) return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  const isAdmin = hasAdminPerks(p.role);
  // A staff account's monthly cap.
  const capMsg = await staffCapMessage(s.admin, s.user.id, p.role);
  if (capMsg) return NextResponse.json({ error: capMsg, code: "staff_cap" }, { status: 402 });

  if (!isAdmin && availableFor(p as never, "long") < PODCAST_LONG_VIDEOS) {
    return NextResponse.json({ error: "An episode uses 1 long video, and you don't have one left. Buy one in Billing.", code: "out_of_videos" }, { status: 402 });
  }

  // The host: a look of their own (photo look, twin or outfit), else the wide headshot copy.
  let hostLook = typeof b.lookId === "string" ? b.lookId : "";
  if (hostLook) {
    const own = p.heygen_photo_id ? (await getAvatarLooks(p.heygen_photo_id).catch(() => [])).map((l) => l.id) : [];
    if (!own.includes(hostLook) && !twinLookIds(p).includes(hostLook)) hostLook = "";
  }
  hostLook ||= layout === "desk" ? (p.heygen_digital_twin_look_id ?? "") : (p.heygen_look_wide ?? "");
  if (!hostLook) return NextResponse.json({ error: layout === "desk" ? "At the desk needs your Digital Twin. Make it in Settings, or choose One at a time." : "Add your headshot or pick a look first.", code: "no_headshot" }, { status: 409 });
  const twin = isTwinLook(hostLook, p);
  // The desk cuts each person out of their own video: that takes a twin.
  if (layout === "desk" && !twin) return NextResponse.json({ error: "At the desk needs your Digital Twin as your look. Pick it, or choose One at a time." }, { status: 400 });
  if (twin && !canUseDigitalTwin(p.subscription_tier, p.role)) {
    return NextResponse.json({ error: "Your Digital Twin comes with a paid plan. Pick a photo look." }, { status: 403 });
  }
  if (twin && ((hostLook === p.heygen_twin2_look_id && p.twin2_consent_needed) || (hostLook !== p.heygen_twin2_look_id && p.twin_consent_needed))) {
    return NextResponse.json({ error: "Your Digital Twin needs your one-time approval first. Approve it in Settings.", code: "twin_consent_required" }, { status: 409 });
  }
  const hostVoice = await ensureVoiceForRender({ id: s.user.id, heygen_voice_id: p.heygen_voice_id, voice_sample_url: p.voice_sample_url });
  if (!hostVoice) return NextResponse.json({ error: "Set up your voice in Settings first." }, { status: 409 });

  // The co-host: a partner who allowed it, or a ready-made avatar.
  let guest: { lookId: string; voiceId: string; name: string; partnerId?: string; partnerRow?: string };
  if ((b.coHostId ?? "").startsWith(PARTNER_PREFIX)) {
    const r = await resolvePartnerCoHost(s.admin, s.user.id, b.coHostId!);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
    guest = { lookId: r.lookId, voiceId: r.voiceId, name: r.name, partnerId: r.partnerId, partnerRow: r.rowId };
  } else {
    const c = (await listCoHosts()).find((x) => x.id === b.coHostId);
    if (!c) return NextResponse.json({ error: "Pick a co-host." }, { status: 400 });
    guest = { lookId: c.id, voiceId: c.voiceId, name: c.name };
  }
  const setId = (STUDIO_SETS.some((x) => x.id === b.setId) ? b.setId : "warm") as StudioSetId;
  let setUrl: string;
  try { setUrl = await studioSetUrl(s.admin, setId); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't make the studio set." }, { status: 502 }); }

  // The Spark it belongs to, and its video row (the id doubles as HeyGen's idempotency key).
  const script = convo.turns.map((t) => t.text).join(" ");
  const { data: project, error: projErr } = await s.admin.from("projects").insert({
    user_id: s.user.id, title: convo.title, project_type: "location_script", status: "draft",
    ai_script: { kind: "podcast", title: convo.title, hook: "", script, cta: "", description: "", hashtags: [], turns: convo.turns, cohost: { id: b.coHostId, name: guest.name }, set: setId, layout },
  }).select("id").single();
  if (projErr || !project) return NextResponse.json({ error: "Couldn't start the episode." }, { status: 500 });
  const projectId = (project as { id: string }).id;
  const desk: DeskRecord | undefined = layout === "desk" ? {
    setId,
    // A ready-made co-host is framed closer than a twin; a partner's twin matches the host.
    guestScale: guest.partnerId ? 1 : 0.8, guestLift: guest.partnerId ? 0 : 60,
    partner: guest.partnerId ? { partnerId: guest.partnerId, hostName: p.full_name || "Your host" } : null,
    parts: {},
  } : undefined;
  const { data: row, error: rowErr } = await s.admin.from("generated_videos").insert({
    project_id: projectId, user_id: s.user.id, video_type: "youtube_16x9",
    render_provider: layout === "desk" ? "podcast_desk" : "heygen_v3_direct", render_status: "rendering",
    metadata: {
      dimension: layout === "desk" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }, orientation: "landscape", title: convo.title,
      city: p.location_city, state: p.location_state, captions_enabled: true, is_podcast: true, podcast_layout: layout,
      heygen_engine: "avatar_iii", is_digital_twin: twin,
      ...(desk && { desk }),
    },
  }).select("id, metadata").single();
  if (rowErr || !row) return NextResponse.json({ error: "Couldn't start the episode." }, { status: 500 });
  const videoRowId = (row as { id: string }).id;
  if (twin) {
    const col = hostLook === p.heygen_twin2_look_id ? "twin2_consent_needed" : "twin_consent_needed";
    await s.admin.from("profiles").update({ [col]: false }).eq("id", s.user.id).eq(col, true);
  }

  if (layout === "desk") {
    // The voices and the two renders take a minute or two: answered now, done in the background.
    waitUntil(startDeskEpisode(s.admin, {
      rowId: videoRowId, userId: s.user.id, title: convo.title, turns: convo.turns,
      host: { lookId: hostLook, voiceId: hostVoice }, guest: { lookId: guest.lookId, voiceId: guest.voiceId }, isAdmin,
    }));
    return NextResponse.json({ videoId: videoRowId, projectId });
  }

  // One at a time: one HeyGen studio video.
  const hostSp = { avatarId: hostLook, voiceId: hostVoice, removeBackground: true };
  const guestSp = { avatarId: guest.lookId, voiceId: guest.voiceId, removeBackground: true };
  const callbackUrl = buildCallbackUrl();
  let videoId: string;
  try {
    try {
      videoId = await submitStudioVideo(studioBody({ title: convo.title, turns: convo.turns, host: hostSp, guest: guestSp, setUrl, callbackUrl, callbackId: videoRowId }), videoRowId);
    } catch (err) {
      // A photo look that can't have its background taken out: the host keeps
      // its own background rather than the episode failing.
      const e = err as { status?: number; body?: string };
      if (e.status !== 400 || !/background|matting/i.test(e.body ?? "")) throw err;
      console.warn("[podcast] host background removal refused; trying without it");
      videoId = await submitStudioVideo(studioBody({ title: convo.title, turns: convo.turns, host: { ...hostSp, removeBackground: false }, guest: guestSp, setUrl, callbackUrl, callbackId: videoRowId }), `${videoRowId}-b`);
    }
  } catch (err) {
    console.error("[podcast] submit failed:", err instanceof Error ? err.message : err);
    await s.admin.from("generated_videos").update({ render_status: "failed" }).eq("id", videoRowId);
    return NextResponse.json({ error: "The episode couldn't be started. Nothing was charged. Try again." }, { status: 502 });
  }

  // Charged only now that HeyGen has it; recorded so a failure refunds it.
  const source = isAdmin ? null : (await chargeOneVideo(s.admin, s.user.id, "long"))?.source ?? null;
  await s.admin.from("generated_videos").update({
    render_job_id: videoId,
    metadata: {
      ...((row as { metadata: Record<string, unknown> | null }).metadata ?? {}),
      credit_cost: isAdmin ? 0 : PODCAST_LONG_VIDEOS, credit_kind: "long", credit_source: source ?? "plan",
    },
  }).eq("id", videoRowId);
  await s.admin.from("api_usage_log").insert({ user_id: s.user.id, api_provider: "heygen", endpoint: "podcast-studio", credits_used: PODCAST_LONG_VIDEOS, response_status: 202 });

  return NextResponse.json({ videoId: videoRowId, projectId });
}
