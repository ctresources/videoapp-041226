/**
 * POST /api/video/cinematic-avatar
 *
 * A Cinematic AI Avatar video (2026-11-24, the owner's approved mockup): the
 * agent's Digital Twin says each line of the script in a different place.
 * Paid plans, Digital Twin only, and it uses one video, as Full AI Avatar does.
 *
 * Built after the reply has gone, the way a Scenes Reel is
 * (app/api/video/photo-reel): the rows are made first and marked rendering,
 * My Sparks follows the row, and the build fills it in or marks it failed.
 *
 *   1. One shot per scene (lib/video/cinematic-avatar.ts), a few at a time.
 *   2. Each shot is saved, listened to, and cut where its line ends: a shot
 *      given room after its line once filled it with made-up words.
 *   3. The cut lines are joined into one soundtrack, and the shots are laid
 *      over it at their own speed by the reel renderer, with captions and
 *      music as chosen.
 *
 * The video is taken from the plan only once it is saved. Any scene that
 * cannot be made fails the whole video, because a missing scene is a missing
 * line, and nothing is taken.
 */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminPerks, staffCapMessage } from "@/lib/utils/roles";
import { canUseTwinInFullVideo } from "@/lib/utils/plan-features";
import { ALLOWANCE_SELECT, chargeFor, chargeOneVideo, type AllowanceColumns } from "@/lib/utils/video-allowance";
import { freeRedoFor, REDO_CREDIT_SOURCE } from "@/lib/utils/free-redo";
import { standardMaxWords } from "@/lib/utils/video-length";
import { joinClipAudio, renderPhotoSlideshow, type VideoType } from "@/lib/api/ffmpeg-render";
import { transcribeToWords } from "@/lib/utils/srt";
import { lineIsWaiting } from "@/lib/video/render-queue";
import { twinApprovedAtHeyGen } from "@/lib/api/heygen";
import { announceVideoReady } from "@/lib/video/ready-notice";
import {
  CINEMATIC_MAX_SCENES, MAX_LINE_WORDS, cleanPlace, makeCinematicShots, speechEnd,
  type CinematicScene,
} from "@/lib/video/cinematic-avatar";
import type { WordTimestamp } from "@/lib/api/whisper";

// Shots, then the render: the same allowance a Scenes Reel has.
export const maxDuration = 800;

/** Shots get this long; the render has the rest of the function's time. */
const SHOTS_BUDGET_MS = 480_000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    scenes?: { line?: unknown; place?: unknown }[];
    format?: string;
    captions?: boolean;
    musicUrl?: string;
    /** Which Digital Twin, when there are two. */
    lookId?: string;
  };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(`id, role, subscription_tier, logo_url, location_city, heygen_digital_twin_look_id, heygen_twin2_look_id, heygen_digital_twin_group_id, heygen_twin2_group_id, twin_consent_needed, twin2_consent_needed, ${ALLOWANCE_SELECT}`)
    .eq("id", user.id)
    .single();
  const p = (profile ?? {}) as Record<string, unknown>;
  const role = (p.role as string | null) ?? null;
  const tier = (p.subscription_tier as string | null) ?? "free";
  const isAdmin = hasAdminPerks(role);

  if (!canUseTwinInFullVideo(tier, role)) {
    return NextResponse.json({ error: "Cinematic AI Avatar is on the paid plans. See plans in Billing.", code: "paid_only" }, { status: 403 });
  }

  // Digital Twin only, approved: only a twin speaks in the agent's own voice.
  const twins = [
    { id: p.heygen_digital_twin_look_id as string | null, ok: !p.twin_consent_needed, slot: 1 as const, group: p.heygen_digital_twin_group_id as string | null },
    { id: p.heygen_twin2_look_id as string | null, ok: !p.twin2_consent_needed, slot: 2 as const, group: p.heygen_twin2_group_id as string | null },
  ].filter((t): t is { id: string; ok: boolean; slot: 1 | 2; group: string | null } => !!t.id);
  if (twins.length === 0) {
    return NextResponse.json({ error: "Cinematic AI Avatar needs your Digital Twin. Make one in Settings.", code: "no_twin" }, { status: 400 });
  }
  const twin = twins.find((t) => t.id === body.lookId) ?? twins.find((t) => t.ok) ?? twins[0];
  /**
   * Approved in the app AND at HeyGen (2026-11-25): HeyGen refuses every
   * cinematic shot of a twin whose approval it still has pending, which Abby
   * Vellucci's was. Asked before anything is built; the editor offers
   * Approve now, as for the other videos.
   */
  const consentNeeded = () => NextResponse.json(
    {
      error: "Your Digital Twin needs your one-time approval. Approve it, then press Spark It again. Nothing was charged.",
      code: "twin_consent_required",
      slot: twin.slot,
    },
    { status: 409 },
  );
  if (!twin.ok) return consentNeeded();
  if ((await twinApprovedAtHeyGen(twin.group)) === false) {
    await admin.from("profiles").update({ [twin.slot === 2 ? "twin2_consent_needed" : "twin_consent_needed"]: true }).eq("id", user.id);
    return consentNeeded();
  }

  const videoType: VideoType | null = body.format === "youtube_16x9" ? "youtube_16x9" : body.format === "reel_9x16" ? "reel_9x16" : null;
  if (!videoType) {
    return NextResponse.json({ error: "Cinematic AI Avatar is made Vertical or Horizontal." }, { status: 400 });
  }

  const scenes: CinematicScene[] = (Array.isArray(body.scenes) ? body.scenes : [])
    .slice(0, CINEMATIC_MAX_SCENES + 1)
    .map((s) => ({
      line: typeof s?.line === "string" ? s.line.replace(/\s+/g, " ").trim() : "",
      place: cleanPlace(s?.place) || "Bright, simple room",
    }))
    .filter((s) => s.line);
  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  if (scenes.length === 0 || scenes.length > CINEMATIC_MAX_SCENES) {
    return NextResponse.json({ error: "Plan your scenes first." }, { status: 400 });
  }
  if (scenes.some((s) => count(s.line) > MAX_LINE_WORDS + 8)) {
    return NextResponse.json({ error: "A scene's line is too long. Plan your scenes again." }, { status: 400 });
  }
  const totalWords = scenes.reduce((n, s) => n + count(s.line), 0);
  if (totalWords > standardMaxWords()) {
    return NextResponse.json(
      { error: `Cinematic AI Avatar takes up to ${standardMaxWords()} words (about 2 minutes). Yours are ${totalWords}.` },
      { status: 400 },
    );
  }

  // Theirs, or nothing is made.
  const { data: proj } = await admin.from("projects").select("id, user_id").eq("id", body.projectId ?? "").maybeSingle();
  if (!proj || (proj as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const projectId = (proj as { id: string }).id;

  // Checked now, taken at the end (see the top of this file).
  const capMsg = await staffCapMessage(admin, user.id, role);
  if (capMsg) return NextResponse.json({ error: capMsg, code: "staff_cap" }, { status: 402 });
  // One free redo per project within 48 hours (lib/utils/free-redo.ts).
  // Written on the row at once, so a second press while this builds is charged.
  const redoFree = !isAdmin && await freeRedoFor(admin, user.id, projectId, tier);
  if (!isAdmin && !redoFree && !chargeFor(p as Partial<AllowanceColumns>, "short")) {
    return NextResponse.json(
      { code: "out_of_videos", kind: "short", tier, error: "Cinematic AI Avatar uses one video and you have none left. Add more in Billing." },
      { status: 402 },
    );
  }
  const redoCredit = { credit_cost: 0, credit_kind: "short", credit_source: REDO_CREDIT_SOURCE };

  const jobId = `reel-${randomUUID()}`;
  const { data: row, error: rowErr } = await admin
    .from("generated_videos")
    .insert({
      project_id: projectId,
      user_id: user.id,
      video_type: videoType,
      render_provider: "ffmpeg",
      render_status: "rendering",
      render_job_id: jobId,
      metadata: { source: "cinematic-avatar", building: true, scenes: scenes.length, ...(redoFree && redoCredit) },
    })
    .select("id")
    .single();
  if (rowErr || !row) {
    return NextResponse.json({ error: rowErr?.message || "Could not start that video" }, { status: 500 });
  }
  const videoId = (row as { id: string }).id;
  await admin.from("projects").update({ status: "generating" }).eq("id", projectId).eq("user_id", user.id);

  const scenePaths = scenes.map((_, i) => `camera-recordings/${user.id}/cinematic-${videoId}-${i}.mp4`);
  const removeScenes = () => admin.storage.from("assets").remove(scenePaths).then(() => undefined, () => undefined);

  const build = async () => {
    const started = Date.now();
    const aspect = videoType === "youtube_16x9" ? "16:9" as const : "9:16" as const;
    // Fewer at once when videos are waiting in line for HeyGen's slots.
    const atOnce = (await lineIsWaiting().catch(() => false)) ? 2 : 4;
    const parts: ({ url: string; keep: number; words: WordTimestamp[] } | null)[] = new Array(scenes.length).fill(null);

    const shots = await makeCinematicShots(scenes, twin.id, aspect, started + SHOTS_BUDGET_MS, atOnce, async (i, shot) => {
      // Saved to storage at once: the shot's own address does not last.
      const res = await fetch(shot.url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return false;
      const bytes = Buffer.from(await res.arrayBuffer());
      const { error } = await admin.storage.from("assets").upload(scenePaths[i], bytes, { contentType: "video/mp4", upsert: true });
      if (error) return false;
      const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(scenePaths[i]);
      // Listened to for where the line ends. Its sound alone, as an MP3, which
      // is what the transcriber is used with everywhere else.
      let words: WordTimestamp[] = [];
      try {
        words = await transcribeToWords(await joinClipAudio([{ url: publicUrl, keep: shot.seconds }]), "audio/mpeg");
      } catch (err) {
        console.warn(`[cinematic] scene ${i + 1} not transcribed, cut by length:`, err instanceof Error ? err.message : err);
      }
      const keep = speechEnd(words, scenes[i].line, shot.seconds);
      parts[i] = { url: publicUrl, keep, words: words.filter((w) => w.end <= keep + 0.05) };
      return true;
    });
    if (shots.some((s) => !s) || parts.some((x) => !x)) {
      throw new Error("A scene couldn't be made this time, so nothing was taken from your plan. Try again in a few minutes.");
    }
    const made = parts as { url: string; keep: number; words: WordTimestamp[] }[];
    console.log(`[cinematic] ${made.length} scenes in ${Math.round((Date.now() - started) / 1000)}s`);

    const starts: number[] = [];
    let total = 0;
    for (const part of made) { starts.push(total); total += part.keep; }
    const audioBuffer = await joinClipAudio(made.map((x) => ({ url: x.url, keep: x.keep })));
    const wordTimestamps: WordTimestamp[] = body.captions === false
      ? []
      : made.flatMap((x, i) => x.words.map((w) => ({ word: w.word, start: w.start + starts[i], end: w.end + starts[i] })));

    const mp4 = await renderPhotoSlideshow(
      {
        // No title card and no closing card: either would sit over the face.
        title: "",
        audioBuffer,
        photoUrls: made.map(() => ""),
        wordTimestamps,
        clips: made.map((x) => ({ url: x.url, seconds: x.keep })),
        reverseAlternate: false,
        clipsAtOwnSpeed: true,
        segmentStarts: starts,
        // The shots are 720p, so the smaller frame loses nothing and renders faster.
        compact: total > 70,
        logoUrl: (p.logo_url as string | null) ?? undefined,
        musicUrl: body.musicUrl?.startsWith("https://") ? body.musicUrl : null,
        musicVolume: 0.12,
        endCard: null,
      },
      videoType,
    );

    const storagePath = `camera-recordings/${user.id}/cinematic-${Date.now()}.mp4`;
    const { error: upErr } = await admin.storage.from("assets").upload(storagePath, mp4, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Could not save the finished video: ${upErr.message}`);
    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);

    // Taken now that it exists (admins are not charged, as everywhere).
    const charged = isAdmin || redoFree ? null : await chargeOneVideo(admin, user.id, "short");
    if (!isAdmin && !redoFree && !charged) console.warn(`[cinematic] ${videoId} made but nothing was left to charge`);

    await admin.from("projects").update({ status: "ready" }).eq("id", projectId).eq("user_id", user.id);
    const { error: vidErr } = await admin
      .from("generated_videos")
      .update({
        video_url: publicUrl,
        render_status: "completed",
        duration_seconds: Math.round(total),
        metadata: {
          source: "cinematic-avatar",
          // Read by isAiMadeVideo for the platforms' AI labels.
          motion: "cinematic-avatar",
          scenes: made.length,
          cinematic_seconds: Math.round(total),
          ...(charged && { credit_cost: 1, credit_kind: "short", credit_source: charged.source }),
          ...(redoFree && redoCredit),
        },
      })
      .eq("id", videoId)
      .eq("user_id", user.id);
    if (vidErr) throw new Error(vidErr.message);
    await announceVideoReady(admin, videoId);
    await admin.from("api_usage_log").insert({
      user_id: user.id, api_provider: "heygen", endpoint: "cinematic-avatar", credits_used: charged ? 1 : 0, response_status: 200,
    });
    await removeScenes();
  };

  /** Said on the row, where My Sparks reads it; nothing was charged. */
  const failed = async (reason: string) => {
    const message = /nothing was taken/i.test(reason) ? reason : `${reason} Nothing was taken from your plan.`;
    console.error(`[cinematic] ${videoId} failed: ${reason}`);
    await admin
      .from("generated_videos")
      .update({ render_status: "failed", metadata: { source: "cinematic-avatar", render_error: reason, render_message: message } })
      .eq("id", videoId)
      .eq("render_status", "rendering");
    await admin.from("projects").update({ status: "error" }).eq("id", projectId).eq("user_id", user.id);
    await removeScenes();
  };

  waitUntil(build().catch((err) => failed(err instanceof Error ? err.message : "That video could not be made.")));

  return NextResponse.json({ videoId, renderJobId: jobId, background: true });
}
