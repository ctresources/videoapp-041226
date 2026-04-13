import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/profile/heygen-voices
 * Returns all voices available in the connected HeyGen account,
 * including any instant voice clones created in HeyGen AI Studio.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HEYGEN_API_KEY not configured" }, { status: 500 });

  const res = await fetch("https://api.heygen.com/v2/voices", {
    headers: { "x-api-key": apiKey },
    // Cache for 60s so rapid UI refreshes don't hammer the API
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    return NextResponse.json(
      { error: `HeyGen voices fetch failed (${res.status}): ${err.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const json = await res.json();
  const voices: Array<{
    voice_id: string;
    name: string;
    language: string;
    gender: string;
    preview_audio: string | null;
  }> = json.data?.voices ?? [];

  return NextResponse.json({ voices });
}
