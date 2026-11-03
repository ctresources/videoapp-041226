/**
 * Background colors for video templates (2026-11-03, the owner's ask): the
 * dark shading behind the words on every design. Saved with the words as
 * fields.bg ("navy", …, or "brand"), so the preview, the animation and
 * "Edit the words" all follow it. Empty = each design's own look.
 * No server-only imports here: the page uses this list too.
 */
export const BACKGROUNDS = [
  { id: "", name: "Standard", hex: "" },
  { id: "navy", name: "Navy", hex: "#14213d" },
  { id: "black", name: "Black", hex: "#050505" },
  { id: "charcoal", name: "Charcoal", hex: "#2b2d31" },
  { id: "burgundy", name: "Burgundy", hex: "#4a1020" },
  { id: "forest", name: "Forest", hex: "#123524" },
  { id: "brand", name: "Brand color", hex: "" },
] as const;

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
/** hex mixed toward black by t (0–1). */
export const darken = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * (1 - t)).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
};

/** hex mixed toward white by t (0–1). */
export const lighten = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
};

/** The chosen shade as a hex, or null for the design's own look. The brand color is darkened until white words read on it. */
export function shadeOf(bg: string | undefined, accent: string): string | null {
  const id = (bg ?? "").trim();
  if (id === "brand") {
    if (!/^#[0-9a-f]{6}$/i.test(accent)) return null;
    let t = 0;
    while (t < 0.9 && lum(darken(accent, t)) > 55) t += 0.05;
    return darken(accent, t);
  }
  return BACKGROUNDS.find((b) => b.id === id)?.hex || null;
}
