import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // download + transcription of long recordings

interface SttWord {
  text: string;
  start: number;
  end: number;
  type?: string;
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rem = ms % 1000;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
}

/** Group word timestamps into SRT cues — max 7 words or 3.5s per cue. */
function buildSrt(words: SttWord[]): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let current: SttWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
  };

  for (const w of words) {
    current.push(w);
    const spanTooLong = current[current.length - 1].end - current[0].start >= 3.5;
    const sentenceEnd = /[.!?]$/.test(w.text);
    if (current.length >= 7 || spanTooLong || sentenceEnd) flush();
  }
  flush();

  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

/**
 * POST /api/video/captions — { videoId }
 * Generates an SRT caption file for a finished video by transcribing its
 * audio with ElevenLabs STT (word-level timestamps). The result is cached in
 * the video row's metadata so repeat downloads are instant. Returned as
 * text/plain; the client saves it as a .srt file the user can attach in
 * YouTube Studio (accurate captions + caption-text SEO).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Transcription not configured" }, { status: 503 });
  }

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from("generated_videos")
    .select("id, video_url, render_status, metadata")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (!video?.video_url || video.render_status !== "completed") {
    return NextResponse.json({ error: "Video not ready" }, { status: 400 });
  }

  const meta = (video.metadata as Record<string, unknown> | null) ?? {};

  // Cached from a previous request — no need to re-transcribe
  if (typeof meta.srt === "string" && meta.srt.length > 0) {
    return new NextResponse(meta.srt, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const videoRes = await fetch(video.video_url as string);
    if (!videoRes.ok) throw new Error("Failed to fetch video file");
    const videoBuffer = await videoRes.arrayBuffer();

    const contentType = videoRes.headers.get("content-type") || "video/mp4";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([videoBuffer], { type: contentType }),
      contentType.includes("webm") ? "video.webm" : "video.mp4",
    );
    formData.append("model_id", "scribe_v1");
    formData.append("language_code", "en");
    formData.append("timestamps_granularity", "word");

    const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: formData,
    });
    if (!sttRes.ok) throw new Error(`Transcription failed: ${await sttRes.text()}`);

    const result = await sttRes.json();
    const words: SttWord[] = (result.words || [])
      .filter((w: SttWord) => (w.type ?? "word") === "word" && typeof w.start === "number")
      .map((w: SttWord) => ({ text: w.text, start: w.start, end: w.end }));

    if (words.length === 0) {
      return NextResponse.json({ error: "No speech detected in this video" }, { status: 422 });
    }

    const srt = buildSrt(words);

    await admin
      .from("generated_videos")
      .update({ metadata: { ...meta, srt } })
      .eq("id", video.id);

    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "elevenlabs",
      endpoint: "stt-captions",
      credits_used: 0,
      response_status: 200,
    });

    return new NextResponse(srt, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[captions] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Caption generation failed" },
      { status: 500 },
    );
  }
}
