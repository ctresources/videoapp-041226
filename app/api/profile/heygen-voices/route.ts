import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/profile/heygen-voices
 * Returns all voices available in the connected HeyGen account,
 * including any instant voice clones created in HeyGen AI Studio.
 *
 * v3 since Sept 2026 (v1/v2 retire on 2026-10-31). Two shape changes came
 * with it: the rows are a flat `data` array rather than `data.voices`, and
 * the list is cursor-paginated. A single page would have hidden exactly what
 * this route exists to return — a private clone sits far past the first page
 * of public voices — so it walks the cursor.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice library is not configured" }, { status: 500 });

  type V3Voice = {
    voice_id: string;
    name?: string;
    language?: string;
    gender?: string;
    preview_audio_url?: string | null;
    type?: string;
  };

  const rows: V3Voice[] = [];
  let token: string | undefined;
  // Bounded like the brand-kit walk: enough pages to reach a private clone,
  // never an unbounded loop against someone else's pagination bug.
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: "100", ...(token ? { token } : {}) });
    const res = await fetch(`https://api.heygen.com/v3/voices?${qs}`, {
      headers: { "x-api-key": apiKey },
      // Cache for 60s so rapid UI refreshes don't hammer the API
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      console.error(`[heygen-voices] page ${page} failed (${res.status}): ${err.slice(0, 200)}`);
      // A later page failing still leaves a usable list; only an empty one is
      // worth an error, and the vendor's name stays out of it.
      if (rows.length === 0) {
        return NextResponse.json({ error: "Couldn't load the voice library. Try again." }, { status: 502 });
      }
      break;
    }

    const json = await res.json();
    rows.push(...((json.data ?? []) as V3Voice[]));
    if (!json.has_more || !json.next_token) break;
    token = json.next_token as string;
  }

  // preview_audio_url in v3, preview_audio in v2 — keep the old key so any
  // caller written against this route keeps working.
  const voices = rows.map((v) => ({
    voice_id: v.voice_id,
    name: v.name ?? "Unnamed voice",
    language: v.language ?? "",
    gender: v.gender ?? "",
    preview_audio: v.preview_audio_url ?? null,
    /** "public" is the stock library; anything else is this account's own. */
    type: v.type ?? "public",
  }));

  return NextResponse.json({ voices });
}
