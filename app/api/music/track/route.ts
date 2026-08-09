/**
 * GET /api/music/track?q=<query>
 *
 * Resolves a music preset query against HeyGen's licensed catalog and streams
 * the audio back through our own origin.
 *
 * The camera recorder mixes music with WebAudio, and
 * createMediaElementSource() outputs silence for audio it cannot read under
 * CORS — so a bare catalog URL would play as nothing at all. Serving the bytes
 * from our own origin removes the question entirely. It also keeps the
 * pre-signed catalog URL server-side, so this is not a general-purpose proxy:
 * the client only ever supplies a search query.
 */
import { createClient } from "@/lib/supabase/server";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const track = (await searchBackgroundMusic(q, 1))[0];
    if (!track) return NextResponse.json({ error: "No matching track found" }, { status: 404 });

    const upstream = await fetch(track.audio_url, { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Track fetch failed (${upstream.status})` }, { status: 502 });
    }

    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    return new NextResponse(upstream.body, { headers });
  } catch (err) {
    console.error("[music/track] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Music fetch failed" },
      { status: 502 },
    );
  }
}
