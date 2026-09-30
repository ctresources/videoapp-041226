/**
 * Custom banner colors: the agent's own background, text and accent, turned
 * into the same five-color palette the preset swatches use.
 *
 * Pure, so the Banners form can suggest readable text colors with the exact
 * rule the renderer applies.
 */

export interface BannerPaletteColors {
  gradLeft: string;
  gradRight: string;
  navy: string;   // headline / captions / sub lines
  royal: string;  // main word (accent)
  qrDark: string; // QR module color
}

export interface BannerCustomColors {
  bgLeft: string;
  bgRight: string;
  text: string;
  accent: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text and accent colors that read on this background: dark on light, light
 * on dark, judged against whichever end of the gradient is harder to read on.
 */
export function suggestTextColors(bgLeft: string, bgRight: string): { text: string; accent: string } {
  const dark = { text: "#1e293b", accent: "#1d4ed8" };
  const light = { text: "#ffffff", accent: "#fcd34d" };
  const worst = (c: string) => Math.min(contrast(c, bgLeft), contrast(c, bgRight));
  return worst(dark.text) >= worst(light.text) ? dark : light;
}

/**
 * The palette for a custom choice, or null when any color is not a hex value
 * (the caller then falls back to a preset).
 *
 * The QR code is the one color not taken as given: it sits on its own white
 * square and has to be dark on it or phones cannot scan it. So it borrows the
 * text or accent color when either is dark enough, and near-black otherwise,
 * which is what white text on a dark banner needs.
 */
export function customPalette(c: Partial<BannerCustomColors> | null | undefined): BannerPaletteColors | null {
  if (!c || ![c.bgLeft, c.bgRight, c.text, c.accent].every(isHexColor)) return null;
  const qrDark = [c.text!, c.accent!]
    .filter((x) => contrast(x, "#ffffff") >= 4.5)
    .sort((a, b) => luminance(a) - luminance(b))[0] ?? "#111827";
  return { gradLeft: c.bgLeft!, gradRight: c.bgRight!, navy: c.text!, royal: c.accent!, qrDark };
}
