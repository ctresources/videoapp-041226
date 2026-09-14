/**
 * Stock video search — provides real video footage for b-roll backgrounds.
 * Uses Pixabay's free video API (CC0 license, no attribution required).
 * No vendor name is shown to end users.
 */

const PIXABAY_API = "https://pixabay.com/api/videos/";

export interface StockClip {
  url: string;        // direct MP4 URL
  width: number;
  height: number;
  duration: number;   // seconds
  tags: string;
}

interface Rendition { url: string; width: number; height: number; size: number }

/**
 * Choose the cheapest rendition that still covers `targetWidth`.
 *
 * Pixabay's size names are relative to each clip, not absolute: a 4K source's
 * "medium" is 2560x1440 at ~54MB, while a 1080p source's "medium" is 1280x720
 * at ~2.7MB. Selecting by name pulled ~117MB for four clips — all of it
 * downscaled straight back to 720p by the compositor, inside a webhook that
 * has already blown its 300s budget once. Selecting by width gets the same
 * footage in ~23MB.
 */
function pickRendition(videos: Record<string, Rendition>, targetWidth: number): Rendition | null {
  const all = Object.values(videos).filter((v) => v?.url && v.width > 0);
  if (all.length === 0) return null;
  const covering = all.filter((v) => v.width >= targetWidth).sort((a, b) => a.width - b.width);
  // Nothing big enough — take the largest we have rather than nothing.
  return covering[0] ?? all.sort((a, b) => b.width - a.width)[0];
}

/**
 * Search for stock video clips matching real estate keywords.
 * Returns direct MP4 URLs that HeyGen can use as scene backgrounds.
 *
 * For location-specific b-roll, pass city/state as part of the keywords
 * (e.g. ["Plymouth Meeting PA homes", "suburban neighborhood aerial"]).
 *
 * @param keywords    Search terms — include city/state for location-specific footage
 * @param orientation "landscape" | "portrait" — picks best resolution
 * @param perPage     How many clips per keyword (minimum 3 — see below)
 */
export async function searchStockVideos(
  keywords: string[],
  orientation: "landscape" | "portrait" = "landscape",
  perPage = 3,
): Promise<StockClip[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("[stock-video] PIXABAY_API_KEY not set — skipping stock footage");
    return [];
  }

  /**
   * Kept per query, not in one flat list, so the results can be interleaved
   * below. Flat, the caller's `slice(0, 4)` took the first query's three hits
   * and one of the second's — so a video's b-roll was mostly one search, which
   * is the repetition this is meant to avoid.
   */
  const perQuery: StockClip[][] = [];

  // Search each keyword independently, take top results
  const queries = keywords.length > 0
    ? keywords.slice(0, 4)
    : ["real estate home exterior", "neighborhood aerial view"];

  for (const query of queries) {
    const found: StockClip[] = [];
    try {
      const params = new URLSearchParams({
        key: apiKey,
        q: query,
        video_type: "film",
        // Pixabay rejects per_page below 3 with `"per_page" is out of valid
        // range` — a 400 that the !res.ok guard below swallows silently. The
        // default used to be 2, so every search returned nothing at all.
        per_page: String(Math.max(3, perPage)),
        safesearch: "true",
        order: "popular",
      });

      const res = await fetch(`${PIXABAY_API}?${params}`);
      if (!res.ok) {
        // A specific place name is a normal miss here, not a fault: Pixabay
        // AND-matches tags and no CC0 clip is tagged with a township. Logged
        // at warn so a real outage still shows, without reading as one.
        console.warn(`[stock-video] No results for "${query}" (${res.status})`);
        continue;
      }

      const data = await res.json() as {
        hits: Array<{
          tags: string;
          duration: number;
          videos: Record<string, Rendition>;
        }>;
      };

      for (const hit of data.hits) {
        const vid = pickRendition(hit.videos, orientation === "portrait" ? 720 : 1280);
        if (!vid) continue;
        found.push({
          url: vid.url,
          width: vid.width,
          height: vid.height,
          duration: hit.duration,
          tags: hit.tags,
        });
      }
      if (found.length) perQuery.push(found);
    } catch (err) {
      console.error(`[stock-video] Error searching "${query}":`, err);
    }
  }

  /**
   * One from each query, then the seconds, then the thirds.
   *
   * The caller takes the first few of whatever comes back, so the order here
   * decides the variety. Round-robin means four clips are four different
   * searches rather than one search's top four — which, on footage as
   * interchangeable as this, is the whole difference between b-roll that
   * looks chosen and b-roll that looks stuck.
   */
  const clips: StockClip[] = [];
  const seen = new Set<string>();
  const deepest = Math.max(0, ...perQuery.map((q) => q.length));
  for (let rank = 0; rank < deepest; rank++) {
    for (const queryHits of perQuery) {
      const clip = queryHits[rank];
      // The same clip can win two related searches; taking it twice would put
      // the identical footage on screen twice and read as a loop.
      if (!clip || seen.has(clip.url)) continue;
      seen.add(clip.url);
      clips.push(clip);
    }
  }

  return clips;
}
