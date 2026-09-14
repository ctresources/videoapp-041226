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
  /**
   * How many photos the user supplied. Stock used to be skipped entirely when
   * this was non-zero, so six photos under a three-minute script looped every
   * 24 seconds. Now it tops the sequence up instead of standing in for it.
   */
  userPhotoCount: number;
  scriptWords: number;
  keywords?: string[];
  city?: string | null;
  state?: string | null;
  orientation: "landscape" | "portrait";
}): Promise<string[]> {
  if (opts.scriptWords > STOCK_BROLL_MAX_WORDS) {
    console.log(`[stock-broll] Script is ${opts.scriptWords} words — too long to composite, skipping`);
    return [];
  }

  // Only fetch what the photos don't already cover. Each photo holds 4s and
  // each clip 5s, against a runtime of roughly words/145 minutes. Every clip is
  // downloaded and re-encoded inside a 300s budget that compositing already
  // spends 225s of, so this stays capped well below full coverage: the aim is a
  // longer, more varied loop, not eliminating repetition outright.
  const runtimeSeconds = (opts.scriptWords / 145) * 60;
  const coveredByPhotos = opts.userPhotoCount * 4;
  const shortfall = Math.max(0, runtimeSeconds - coveredByPhotos);
  // Each clip now holds 20s rather than 5 — see SECONDS_PER_CLIP in
  // composite-photos. Length is free (pass 2 re-encodes the full runtime
  // regardless) while each extra clip is another download inside the same
  // budget, so the same four clips cover four times the runtime.
  const wanted = Math.min(MAX_CLIPS, Math.ceil(shortfall / 20));
  if (wanted === 0) {
    console.log(`[stock-broll] ${opts.userPhotoCount} photo(s) already cover the runtime — no stock needed`);
    return [];
  }

  /**
   * Three tiers, specific first, each tried only if the ones above it came up
   * short.
   *
   * There used to be one tier and no ladder. A miss was silent: the generic
   * default inside searchStockVideos only applies when the keyword list is
   * empty to begin with, not when every search in it returns nothing — so a
   * script about a named township searched for that township, found one or two
   * loose matches, and cycled them for the whole runtime.
   *
   * The specific tier is still worth asking first — it occasionally hits on a
   * city with real footage — but the honest position is that a free CC0 library
   * has nothing of most suburbs, and the fallbacks are what actually fills the
   * screen. Better four varied generic clips than one repeated specific one.
   */
  const locality = [opts.city, opts.state].filter(Boolean).join(" ");
  const tiers: string[][] = [
    // What this script is about, plus the town.
    [
      ...(locality ? [`${locality} homes neighborhood`] : []),
      ...(opts.keywords ?? []).slice(0, 3),
    ].filter(Boolean),
    // Still regional, but at a scale stock libraries actually cover.
    [
      ...(opts.state ? [`${opts.state} suburban homes`] : []),
      "suburban neighborhood aerial",
      "residential street homes",
    ],
    // Always returns something.
    ["real estate home exterior", "neighborhood aerial view", "modern house exterior"],
  ].filter((t) => t.length > 0);

  const urls: string[] = [];
  try {
    for (const queries of tiers) {
      const clips = await searchStockVideos(queries, opts.orientation);
      for (const clip of clips) {
        if (urls.length >= wanted) break;
        // Across tiers as well as within one: a generic term can return a clip
        // the specific term already found.
        if (!urls.includes(clip.url)) urls.push(clip.url);
      }
      if (urls.length >= wanted) break;
      console.log(
        `[stock-broll] tier returned ${urls.length}/${wanted} clip(s) — widening the search`,
      );
    }
    console.log(
      `[stock-broll] ${opts.userPhotoCount} photo(s) + ${urls.length} stock clip(s) ` +
      `for ~${Math.round(runtimeSeconds)}s of runtime`,
    );
    return urls;
  } catch (err) {
    console.warn("[stock-broll] Lookup failed:", err instanceof Error ? err.message : err);
    // Whatever the earlier tiers did return is still better than nothing.
    return urls;
  }
}
