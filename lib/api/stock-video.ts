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

/**
 * Search for stock video clips matching real estate keywords.
 * Returns direct MP4 URLs that HeyGen can use as scene backgrounds.
 *
 * For location-specific b-roll, pass city/state as part of the keywords
 * (e.g. ["Plymouth Meeting PA homes", "suburban neighborhood aerial"]).
 *
 * @param keywords    Search terms — include city/state for location-specific footage
 * @param orientation "landscape" | "portrait" — picks best resolution
 * @param perPage     How many clips per keyword (default 2)
 */
export async function searchStockVideos(
  keywords: string[],
  orientation: "landscape" | "portrait" = "landscape",
  perPage = 2,
): Promise<StockClip[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("[stock-video] PIXABAY_API_KEY not set — skipping stock footage");
    return [];
  }

  const clips: StockClip[] = [];

  // Search each keyword independently, take top results
  const queries = keywords.length > 0
    ? keywords.slice(0, 4)
    : ["real estate home exterior", "neighborhood aerial view"];

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        key: apiKey,
        q: query,
        video_type: "film",
        per_page: String(perPage),
        safesearch: "true",
        order: "popular",
      });

      const res = await fetch(`${PIXABAY_API}?${params}`);
      if (!res.ok) {
        console.error(`[stock-video] Search failed for "${query}": ${res.status}`);
        continue;
      }

      const data = await res.json() as {
        hits: Array<{
          tags: string;
          duration: number;
          videos: {
            large:  { url: string; width: number; height: number };
            medium: { url: string; width: number; height: number };
            small:  { url: string; width: number; height: number };
          };
        }>;
      };

      for (const hit of data.hits) {
        // Pick resolution: large (1920×1080) for landscape, medium for portrait
        const vid = orientation === "landscape" ? hit.videos.large : hit.videos.medium;
        clips.push({
          url: vid.url,
          width: vid.width,
          height: vid.height,
          duration: hit.duration,
          tags: hit.tags,
        });
      }
    } catch (err) {
      console.error(`[stock-video] Error searching "${query}":`, err);
    }
  }

  return clips;
}
