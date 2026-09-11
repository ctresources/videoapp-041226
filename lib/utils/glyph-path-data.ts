import type * as opentypeNs from "opentype.js";

/**
 * SVG path data written straight from a glyph path's commands.
 *
 * Use this instead of Path.toPathData(). In opentype.js 2.0 its rounding
 * builds the string `decimal + "e+2"`, so a coordinate carrying float noise
 * (a decimal part like 1.1e-13) becomes "1.1e-13e+2" → NaN. librsvg (sharp's
 * SVG renderer) stops drawing a path at the first NaN, which showed up as
 * half-drawn words on banners — "CHARLOTTE" rendered as "CHARL" plus a solid
 * O. The raw commands are always finite; only that formatting step breaks.
 */
export function glyphPathData(p: opentypeNs.Path): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return p.commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L": return `${c.type}${n(c.x)} ${n(c.y)}`;
        case "Q": return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case "C": return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        default: return "Z";
      }
    })
    .join("");
}
