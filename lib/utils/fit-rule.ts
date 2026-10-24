/**
 * When a photo or clip is too different in shape from the video to crop
 * (2026-10-24, the owner's ask). Pure, so the browser recorder and the server
 * renderers share one rule; see fit-frame.ts for the server side.
 *
 * Close in shape (source ÷ frame between 0.7 and 1.43): crop to fill, as
 * before; a landscape phone photo in a 16:9 video loses a little top and
 * bottom. Otherwise (the other orientation, or square): show it whole over a
 * blurred copy of itself.
 */
const FILL_MIN = 0.7;
const FILL_MAX = 1.43;

export function needsBlurFill(srcW: number, srcH: number, outW: number, outH: number): boolean {
  if (!srcW || !srcH || !outW || !outH) return false;
  const r = (srcW / srcH) / (outW / outH);
  return r < FILL_MIN || r > FILL_MAX;
}
