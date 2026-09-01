/**
 * POST /api/video/photo-reel
 *
 * Photos in, a finished reel out. Ken Burns on each shot, dissolves between
 * them, your voice over the top and a music bed underneath — rendered with
 * FFmpeg on our own server, so it costs no HeyGen credit.
 *
 * The audio is the interesting decision. renderPhotoSlideshow takes a buffer
 * and cannot tell where the bytes came from, so all three routes end in the
 * same place: a script read by the agent's own cloned voice, a voiceover they
 * recorded themselves, or silence with music over it. The audio's length is
 * also the video's length — the photos are spread across whatever it turns out
 * to be, rather than the other way round.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSpeechWithTimestamps } from "@/lib/api/elevenlabs";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { renderPhotoSlideshow, generateSilentAudio, type VideoType } from "@/lib/api/ffmpeg-render";
import type { WordTimestamp } from "@/lib/api/whisper";
import { NextRequest, NextResponse } from "next/server";

// A minute of 1080x1920 with twelve photos measured near three minutes on this
// hardware. 300 is what the plan allows and what the longest reel needs.
export const maxDuration = 300;

const FORMATS: Record<string, VideoType> = {
  reel_9x16: "reel_9x16",
  short_1x1: "short_1x1",
  youtube_16x9: "youtube_16x9",
};

/** Long enough to be a video, short enough to finish inside the budget. */
const MIN_SECONDS = 5;
const MAX_SECONDS = 90;
const MAX_PHOTOS = 12;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    photoUrls?: string[];
    title?: string;
    format?: string;
    seconds?: number;
    /** Read aloud in the agent's cloned voice. */
    script?: string;
    /** Storage path of a voiceover they recorded themselves — wins over script. */
    voiceoverPath?: string;
    /** Music preset search query, or null for none. */
    musicQuery?: string | null;
    city?: string;
    state?: string;
  };

  const photoUrls = (body.photoUrls ?? []).filter(Boolean).slice(0, MAX_PHOTOS);
  if (photoUrls.length === 0) {
    return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
  }

  const videoType = FORMATS[body.format ?? "reel_9x16"] ?? "reel_9x16";
  const title = (body.title || "Photo Reel").slice(0, 120);
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, company_name, logo_url, avatar_url, voice_clone_id, location_city, location_state")
    .eq("id", user.id)
    .single();
  const p = (profile ?? {}) as Record<string, string | null>;

  try {
    // ── Audio, from whichever of the three routes was chosen ────────────────
    let audioBuffer: Buffer;
    let wordTimestamps: WordTimestamp[] = [];
    let spokenScript = "";

    if (body.voiceoverPath) {
      // Their own recording. Downloaded rather than trusted from the client:
      // the path is theirs to name, so it is checked against their own folder.
      if (!body.voiceoverPath.startsWith(`camera-recordings/${user.id}/`)) {
        return NextResponse.json({ error: "Invalid recording path" }, { status: 403 });
      }
      const { data, error } = await admin.storage.from("assets").download(body.voiceoverPath);
      if (error || !data) throw new Error("Could not read that voiceover recording.");
      audioBuffer = Buffer.from(await data.arrayBuffer());
    } else if (body.script?.trim()) {
      // Their cloned voice if they have one, ElevenLabs' default if not. The
      // clone is the ElevenLabs one — the HeyGen clone only speaks inside a
      // HeyGen render, which is the credit this whole route exists to avoid.
      const speech = await generateSpeechWithTimestamps(body.script.trim(), p.voice_clone_id);
      audioBuffer = speech.audioBuffer;
      wordTimestamps = speech.wordTimestamps;
      spokenScript = body.script.trim();
    } else {
      // Music only. Silence sets the length precisely, which nothing else here
      // can: a music track is however long it is, and the reel is not.
      const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(body.seconds ?? 30)));
      audioBuffer = await generateSilentAudio(seconds);
    }

    // ── Music bed ───────────────────────────────────────────────────────────
    let musicUrl: string | null = null;
    if (body.musicQuery) {
      try {
        musicUrl = (await searchBackgroundMusic(body.musicQuery, 1))[0]?.audio_url ?? null;
      } catch (e) {
        // A reel without music beats no reel. Said in the log, not to the user.
        console.warn("[photo-reel] music lookup failed:", e);
      }
    }

    // With no narration the bed is the whole soundtrack, so it comes up to
    // where a bed under a voice would be drowned out.
    const musicVolume = spokenScript || body.voiceoverPath ? 0.15 : 0.55;

    const mp4 = await renderPhotoSlideshow(
      {
        title,
        audioBuffer,
        photoUrls,
        wordTimestamps,
        logoUrl: p.logo_url ?? undefined,
        avatarUrl: p.avatar_url ?? undefined,
        agentName: p.full_name ?? undefined,
        musicUrl,
        musicVolume,
      },
      videoType,
    );

    // ── Store it and register it like any other finished video ──────────────
    const storagePath = `camera-recordings/${user.id}/reel-${Date.now()}.mp4`;
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(storagePath, mp4, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Could not save the finished reel: ${upErr.message}`);

    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);

    const { data: project, error: projErr } = await admin
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        project_type: "location_script",
        status: "ready",
        ...(body.city && { location_city: body.city }),
        ...(body.state && { location_state: body.state }),
        ...(spokenScript && {
          ai_script: { title, script: spokenScript, hook: "", cta: "", keywords: [] },
        }),
      })
      .select("id")
      .single();
    if (projErr || !project) throw new Error(projErr?.message || "Could not create the project");

    const { data: videoRow, error: vidErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: (project as { id: string }).id,
        user_id: user.id,
        video_url: publicUrl,
        video_type: videoType,
        render_provider: "ffmpeg",
        render_status: "completed",
        metadata: { source: "photo-reel", photos: photoUrls.length },
      })
      .select("id")
      .single();
    if (vidErr || !videoRow) throw new Error(vidErr?.message || "Could not save the video");

    return NextResponse.json({
      videoId: (videoRow as { id: string }).id,
      videoUrl: publicUrl,
      title,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not build that reel";
    console.error("[photo-reel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
