/**
 * GET /api/music/search?q=<query>
 *
 * Resolves a background-music preset query to a fresh track URL from HeyGen's
 * licensed catalog. Catalog URLs are pre-signed (~7-day expiry), so the client
 * resolves them at selection time rather than using hardcoded URLs.
 */
import { createClient } from "@/lib/supabase/server";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const tracks = await searchBackgroundMusic(q, 1);
    const track = tracks[0];
    if (!track) return NextResponse.json({ error: "No matching track found" }, { status: 404 });
    return NextResponse.json({
      url: track.audio_url,
      name: track.name,
      duration: track.duration,
    });
  } catch (err) {
    console.error("[music/search] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Music search failed" },
      { status: 502 },
    );
  }
}
