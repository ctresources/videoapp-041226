/**
 * Client-safe HeyGen URL helpers.
 *
 * Kept separate from store-video.ts on purpose: store-video pulls in the
 * ffmpeg music mixer (Node-only, uses child_process), so importing it from
 * client components breaks the Next.js build.
 */

/** Returns true if a HeyGen signed URL has passed its Expires timestamp. */
export function isExpiredHeygenUrl(url: string): boolean {
  const match = url.match(/[?&]Expires=(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) < Math.floor(Date.now() / 1000);
}

/** Returns true if the URL is a temporary HeyGen CDN URL (expired or not). */
export function isHeygenUrl(url: string): boolean {
  return url.includes("heygen.ai") || url.includes("heygen.com/aws");
}
