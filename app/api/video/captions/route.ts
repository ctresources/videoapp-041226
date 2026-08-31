import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVideoSrt } from "@/lib/utils/video-srt";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // download + transcription of long recordings

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

  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  // Transcribing, caching and the ownership check all live in ensureVideoSrt,
  // which the transcript editor calls too — so a corrected transcript is what
  // this download serves, rather than the two drifting apart.
  const result = await ensureVideoSrt(createAdminClient(), user.id, videoId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new NextResponse(result.srt, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
