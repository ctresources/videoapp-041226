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

/** The file extension, lowercased, ignoring any query string or fragment. */
function extensionOf(url: string): string {
  return url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
}

/**
 * The container a stored video is actually in.
 *
 * Every player used to declare `type="video/mp4"` for everything, which is a
 * lie for the camera recordings — those are WebM. A browser is entitled to
 * believe the declared type and refuse the file when it doesn't match.
 */
export function videoMimeType(url: string): string {
  switch (extensionOf(url)) {
    case "webm": return "video/webm";
    case "mov":  return "video/quicktime";
    default:     return "video/mp4";
  }
}

/**
 * A tile source that iOS will actually paint a frame from.
 *
 * `preload="metadata"` is a request desktop browsers honour and iOS ignores
 * outright — it downloads nothing until a tap, so every thumbnail rendered as
 * a black rectangle with no duration. A media fragment is not a preload hint
 * but a seek instruction, and iOS does honour that: it fetches enough to land
 * on the frame and leaves it on screen. A tenth of a second in, rather than
 * zero, because the very first frame of a fade-in is often black anyway.
 */
export function posterFrameUrl(url: string): string {
  return url.includes("#") ? url : `${url}#t=0.1`;
}
