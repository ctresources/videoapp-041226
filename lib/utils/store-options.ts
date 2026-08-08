/**
 * Post-processing options for a finished render, derived from its row.
 *
 * Three call sites finalize a render — the HeyGen webhook, the status poll that
 * covers for a webhook that never arrives, and the repair path on the Videos
 * page — and whichever one gets there first is the only one that runs: the
 * other two see a video already stored in our bucket and stand down. So they
 * have to ask for exactly the same work. They did not: only the webhook passed
 * the captions, so a render finalized by either of the other two came back
 * fully composited and silent-captioned. Deriving the options in one place is
 * what keeps that from drifting again.
 */

import { getVideoStatus } from "@/lib/api/heygen";
import type { StoreOptions } from "@/lib/utils/store-video";

export async function buildStoreOptions(
  metadata: Record<string, unknown> | null,
  heygenVideoId?: string | null,
): Promise<StoreOptions> {
  const meta = metadata ?? {};
  // Absent means on: it matches the "Burn synchronized captions" checkbox,
  // which is checked by default and only recorded when the user unchecks it.
  const captionsEnabled = meta.captions_enabled !== false;

  // The sidecar SRT is not in the callback payload — only the status endpoint
  // returns it. Direct Video renders have one; Video Agent renders do not, and
  // store-video transcribes the narration for those instead.
  let subtitleUrl: string | null = null;
  if (captionsEnabled && heygenVideoId) {
    try {
      subtitleUrl = (await getVideoStatus(heygenVideoId)).captionUrl;
    } catch (err) {
      console.warn("[store-options] Could not fetch subtitle URL:", err instanceof Error ? err.message : err);
    }
  }

  return {
    musicUrl: (meta.music_url as string | undefined) || null,
    photoUrls: Array.isArray(meta.photo_urls) ? (meta.photo_urls as string[]) : null,
    clipUrls: Array.isArray(meta.stock_clip_urls) ? (meta.stock_clip_urls as string[]) : null,
    dimension: (meta.dimension as { width: number; height: number } | undefined) || null,
    subtitleUrl,
    captionsEnabled,
    cachedSrt: typeof meta.srt === "string" ? meta.srt : null,
  };
}

/** True once post-processing has run for this render — see store-video. */
export function isPostProcessed(metadata: Record<string, unknown> | null): boolean {
  return (metadata ?? {}).post_processed === true;
}
