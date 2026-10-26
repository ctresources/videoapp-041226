/**
 * How the words on a thumbnail are set (2026-10-25): the font, size, colour and
 * style chosen in the Publish step's thumbnail editor.
 *
 * Plain data, so the editor in the browser and the renderer on the server share
 * one definition without the renderer's server-only imports.
 */

export type ThumbFont = "anton" | "archivo" | "montserrat";
export type ThumbTextStyle = "outline" | "plain" | "box";

export interface ThumbStyle {
  font: ThumbFont;
  /** Multiplier on the size the words would otherwise get. 0.7 to 1.3. */
  size: number;
  /** Hex colour for the words, or the box in box style. null = the house look. */
  color: string | null;
  textStyle: ThumbTextStyle;
}

export const THUMB_FONTS: { id: ThumbFont; label: string }[] = [
  { id: "anton", label: "Condensed" },
  { id: "archivo", label: "Heavy" },
  { id: "montserrat", label: "Clean" },
];

export const THUMB_TEXT_STYLES: { id: ThumbTextStyle; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "plain", label: "Plain" },
  { id: "box", label: "Box" },
];

/** Quick picks. The colour input beside them takes any colour. */
export const THUMB_COLOURS = ["#ffffff", "#ffe600", "#10132b", "#ef4444", "#22c55e", "#3b82f6"];

/** The look every thumbnail had before this existed. */
export const DEFAULT_THUMB_STYLE: ThumbStyle = { font: "anton", size: 1, color: null, textStyle: "outline" };

/** Whatever came in, made safe to use. Unknown values take the default. */
export function cleanThumbStyle(input: unknown): ThumbStyle {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const font = THUMB_FONTS.some((f) => f.id === s.font) ? (s.font as ThumbFont) : DEFAULT_THUMB_STYLE.font;
  const textStyle = THUMB_TEXT_STYLES.some((t) => t.id === s.textStyle)
    ? (s.textStyle as ThumbTextStyle)
    : DEFAULT_THUMB_STYLE.textStyle;
  const size = typeof s.size === "number" && Number.isFinite(s.size)
    ? Math.min(1.3, Math.max(0.7, s.size))
    : DEFAULT_THUMB_STYLE.size;
  const color = typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : null;
  return { font, size, color, textStyle };
}
