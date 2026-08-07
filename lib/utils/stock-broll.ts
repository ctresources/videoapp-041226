/**
 * Stock b-roll fallback for Direct Video renders.
 *
 * Direct Video returns a bare talking head and HeyGen adds no visuals of its
 * own, so a script with no photos is a face for the whole runtime. Stock
 * footage fills that gap — strictly as a fallback, because the user's own
 * photos are always the better b-roll.
 *
 * Both create-blog and rerender need this, and the first version lived only in
 * create-blog, so re-rendering a video silently lost its b-roll. The policy
 * lives here so the two paths cannot drift apart again.
 */
import { searchStockVideos } from "@/lib/api/stock-video";

/**
 * Longest script that still gets stock b-roll.
 *
 * Compositing re-encodes the entire runtime, and burning captions into that
 * same pass adds to it: measured locally on a 3:33 render, pass 1 is ~10s and
 * pass 2 goes 22.3s -> 31.4s with captions, so ~42s total. Against the roughly
 * 5x slower lambda that is ~210s, plus clip downloads and two uploads inside a
 * 300s budget.
 *
 * 600 words is ~4.1 minutes at 145wpm, which keeps the whole job near ~220s.
 * It was 700 before captions joined the same pass; that now projects to ~270s,
 * which is closer to the edge than this should run. A timeout is survivable —
 * store-first means the video is already saved and only the b-roll is lost —
 * but it is not worth courting.
 */
export const STOCK_BROLL_MAX_WORDS = 600;

/** Clips to composite. Each one is downloaded and re-encoded in the webhook. */
const MAX_CLIPS = 4;

export function countWords(script: string): number {
  return script.split(/\s+/).filter(Boolean).length;
}

/**
 * Returns stock clip URLs, or an empty array when stock b-roll does not apply —
 * the user supplied photos, the script is too long, or the lookup failed.
 * Never throws: b-roll is a nicety and must never fail a render.
 */
export async function stockBrollFor(opts: {
  hasUserPhotos: boolean;
  scriptWords: number;
  keywords?: string[];
  city?: string | null;
  state?: string | null;
  orientation: "landscape" | "portrait";
}): Promise<string[]> {
  if (opts.hasUserPhotos) return [];
  if (opts.scriptWords > STOCK_BROLL_MAX_WORDS) {
    console.log(`[stock-broll] Script is ${opts.scriptWords} words — too long to composite, skipping`);
    return [];
  }

  // Locality first so the footage at least reads as the right kind of place;
  // searchStockVideos falls back to generic real-estate terms if this is empty.
  const locality = [opts.city, opts.state].filter(Boolean).join(" ");
  const queries = [
    ...(locality ? [`${locality} homes neighborhood`] : []),
    ...(opts.keywords ?? []).slice(0, 3),
  ].filter(Boolean);

  try {
    const clips = await searchStockVideos(queries, opts.orientation);
    const urls = clips.map((c) => c.url).slice(0, MAX_CLIPS);
    console.log(`[stock-broll] No user photos — using ${urls.length} stock clip(s)`);
    return urls;
  } catch (err) {
    console.warn("[stock-broll] Lookup failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
