/**
 * The words a finished video says, for reading back and correcting.
 *
 * POST { videoId }          → the transcript as timed cues
 * PUT  { videoId, cues }    → replace it with a corrected version
 *
 * What this does NOT do is change the audio. The words are recorded into the
 * file, and nothing here re-records them: a correction fixes the captions, the
 * .srt download and the copy the video is published with. Saying that plainly
 * is the editor's job, not this route's, but it is why the response carries
 * the plain text back — that is the half a correction can actually reach.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVideoSrt, saveVideoSrt } from "@/lib/utils/video-srt";
import { parseSrt, serializeSrt, srtToPlainText, type SrtCue } from "@/lib/utils/srt";
import { NextRequest, NextResponse } from "next/server";

// Transcribing a long recording means downloading it first — the same budget
// the captions route runs on, for the same work.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const result = await ensureVideoSrt(createAdminClient(), user.id, videoId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const cues = parseSrt(result.srt);
  return NextResponse.json({ cues, text: srtToPlainText(cues), cached: result.cached });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { videoId?: string; cues?: SrtCue[] };
  if (!body.videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  if (!Array.isArray(body.cues)) return NextResponse.json({ error: "cues required" }, { status: 400 });

  // Timings come back untouched from what POST handed out; only the words are
  // the user's to change. Rebuilding from the submitted shape rather than
  // trusting a whole SRT string keeps a malformed paste out of the file.
  const cues: SrtCue[] = body.cues
    .filter((c) => c && typeof c.start === "string" && typeof c.end === "string")
    .map((c) => ({
      start: c.start,
      end: c.end,
      text: String(c.text ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    }));

  const srt = serializeSrt(cues);
  if (!srt.trim()) {
    return NextResponse.json(
      { error: "That would leave the transcript empty. Keep at least one line." },
      { status: 400 },
    );
  }

  const saved = await saveVideoSrt(createAdminClient(), user.id, body.videoId, srt);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  return NextResponse.json({ ok: true, text: srtToPlainText(cues) });
}
