/**
 * Where each piece of a banner sits, and how big it is.
 *
 * The banner was a fixed template: every position hard-coded, so the only way
 * to change the arrangement was to change the renderer. Agents want their
 * photo on the other side, or the subscribe block lower, or no QR at all —
 * none of which is worth a code change, and all of which is the difference
 * between a banner they use and one they abandon.
 *
 * Deliberately NOT free-form coordinates. Every value here is a choice from a
 * short list, which keeps two promises the template already made: nothing can
 * be dragged off the canvas, and nothing can be dropped in YouTube's unsafe
 * margins — the outer areas phones and TVs crop away. A drag editor would
 * break both, and would need a pixel-accurate preview to be usable at all.
 */

/** The movable pieces, in the order they are listed in the editor. */
export const BANNER_BLOCKS = ["headline", "photos", "subscribe", "qr1", "qr2"] as const;
export type BannerBlock = (typeof BANNER_BLOCKS)[number];

export const BANNER_BLOCK_LABELS: Record<BannerBlock, string> = {
  headline: "Headline",
  photos: "Photos",
  subscribe: "Subscribe block",
  qr1: "QR code 1",
  qr2: "QR code 2",
};

export type BlockAlign = "left" | "center" | "right";
export type BlockSize = "s" | "m" | "l";

export interface BlockAdjust {
  align?: BlockAlign;
  /**
   * Vertical nudge in CANVAS pixels, not screen pixels — the editor sends
   * multiples of one step so the same nudge means the same thing whatever the
   * preview is scaled to.
   */
  dy?: number;
  size?: BlockSize;
  hidden?: boolean;
}

export type BannerLayout = Partial<Record<BannerBlock, BlockAdjust>>;

/** One press of the up/down control. Coarse enough to see, fine enough to aim. */
export const NUDGE_STEP = 40;

/** How far a block may travel, so nothing can be nudged off the canvas. */
export const NUDGE_LIMIT = 320;

/** What each size means, as a multiplier on the block's template dimensions. */
export const SIZE_SCALE: Record<BlockSize, number> = { s: 0.78, m: 1, l: 1.25 };

export function scaleOf(a: BlockAdjust | undefined): number {
  return SIZE_SCALE[a?.size ?? "m"];
}

/** Clamped, because a value from a request is not a value from the editor. */
export function offsetOf(a: BlockAdjust | undefined): number {
  const dy = Number(a?.dy ?? 0);
  if (!Number.isFinite(dy)) return 0;
  return Math.max(-NUDGE_LIMIT, Math.min(NUDGE_LIMIT, Math.round(dy)));
}

export function isHidden(a: BlockAdjust | undefined): boolean {
  return a?.hidden === true;
}

/**
 * The left edge for a block of `width`, honouring its alignment.
 *
 * "left" keeps the template's own x rather than snapping to the margin: the
 * template's positions are the design, and alignment is a departure from it
 * rather than a replacement for it.
 */
export function alignedX(
  a: BlockAdjust | undefined,
  templateX: number,
  width: number,
  canvasWidth: number,
  margin: number,
): number {
  switch (a?.align) {
    case "center": return Math.round((canvasWidth - width) / 2);
    case "right": return Math.round(canvasWidth - margin - width);
    default: return templateX;
  }
}
