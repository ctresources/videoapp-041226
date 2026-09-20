import { createClient } from "@/lib/supabase/server";
import { rehostImageUrls } from "@/lib/utils/rehost-images";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Copies scraped photos into our own storage so they can be composited.
 *
 * Photos pulled off a listing page are absolute URLs on someone else's domain.
 * Drawing those into the recording canvas is not possible: with
 * crossOrigin="anonymous" they fail to load outright, and without it they taint
 * the canvas — and a tainted canvas cannot be read by MediaRecorder, which
 * would kill the whole recording rather than just the b-roll. Fetching them
 * server-side sidesteps CORS entirely and hands back URLs that are safe to draw.
 *
 * Anything that cannot be copied comes back as its original URL. Callers treat
 * these as best-effort: the b-roll loader skips whatever fails to load.
 *
 * The copying itself lives in lib/utils/rehost-images.ts, because the email
 * import needs it from a webhook that has no session to authenticate.
 */

const MAX_PHOTOS = 12;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let urls: unknown;
  try {
    ({ urls } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(urls)) {
    return NextResponse.json({ error: "urls must be an array" }, { status: 400 });
  }

  const input = urls.filter((u): u is string => typeof u === "string").slice(0, MAX_PHOTOS);
  const copied = await rehostImageUrls(user.id, input);

  return NextResponse.json({ urls: copied });
}
