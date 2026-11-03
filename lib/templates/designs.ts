import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import sharp from "sharp";
import { glyphPathData } from "@/lib/utils/glyph-path-data";
import { darken, lighten, shadeOf } from "@/lib/templates/backgrounds";

const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

/**
 * Video templates (2026-11-02, the owner's approved mockup): five designs.
 * HeyGen makes the plain video of the agent talking; SparkReels puts the
 * photos, the agent's circle and these words on top (lib/templates/compose.ts).
 * The words are drawn here as one see-through layer, in real type, so a price
 * or an address is always spelled right and can be changed later for free.
 */

export const TEMPLATE_FEATURE = "video_templates";
export type DesignId = "just_listed" | "luxury" | "market_update" | "neighborhood" | "agent_intro";
export type Shape = "vertical" | "horizontal";
export const SIZE: Record<Shape, { w: number; h: number }> = { horizontal: { w: 1280, h: 720 }, vertical: { w: 720, h: 1280 } };

export interface Field { key: string; label: string; placeholder?: string }
export interface Design {
  id: DesignId; name: string; blurb: string;
  /** Listing designs use the listing's photos; Market and Neighborhood one place photo; Agent Intro none. */
  photos: "listing" | "place" | "none";
  fields: Field[];
}

/**
 * The agent's name, brokerage and both phones on every design (2026-11-03,
 * the owner's ask): real estate ads have to show the brokerage.
 */
const CONTACT: Field[] = [
  { key: "agent", label: "Your name and brokerage", placeholder: "Jane Smith · Smith Realty Group" },
  { key: "phones", label: "Phones", placeholder: "Mobile (555) 010-2030 · Office (555) 010-9000" },
];

export const DESIGNS: Design[] = [
  { id: "just_listed", name: "Just Listed", blurb: "Agent in a circle, gold label, address and price over the photos.", photos: "listing",
    fields: [{ key: "headline", label: "Headline" }, { key: "address", label: "Address" }, { key: "price", label: "Price" }, { key: "details", label: "Details", placeholder: "3 beds · 2.5 baths · 2,140 sq ft" }, ...CONTACT] },
  { id: "luxury", name: "Luxury Listing", blurb: "Cinema bars, elegant type, gold accents.", photos: "listing",
    fields: [{ key: "headline", label: "Headline" }, { key: "address", label: "Address" }, { key: "price", label: "Price line" }, { key: "details", label: "Details" }, ...CONTACT] },
  { id: "market_update", name: "Market Update", blurb: "Three numbers on screen while the agent explains them.", photos: "place",
    fields: [{ key: "headline", label: "Label" }, { key: "title", label: "Title" },
      { key: "s1", label: "Number 1", placeholder: "$412K" }, { key: "s1l", label: "What it is", placeholder: "Median price" }, { key: "s1c", label: "Change", placeholder: "Up 4%" },
      { key: "s2", label: "Number 2" }, { key: "s2l", label: "What it is" }, { key: "s2c", label: "Change" },
      { key: "s3", label: "Number 3" }, { key: "s3l", label: "What it is" }, { key: "s3c", label: "Change" }, ...CONTACT] },
  { id: "neighborhood", name: "Neighborhood Spotlight", blurb: "The place name big, three highlights, agent in the corner.", photos: "place",
    fields: [{ key: "headline", label: "Label" }, { key: "name", label: "Neighborhood" }, { key: "highlights", label: "Highlights (comma between)", placeholder: "Walkable, Top schools, Riverfront park" }, ...CONTACT] },
  { id: "agent_intro", name: "Agent Introduction", blurb: "Big portrait, name, brokerage, phones and website, with their logo.", photos: "none",
    fields: [{ key: "headline", label: "Label" }, { key: "name", label: "Your name" }, { key: "role", label: "Title and brokerage" }, { key: "phones", label: "Phones" }, { key: "website", label: "Website" }] },
];
export const designById = (id: string) => DESIGNS.find((d) => d.id === id) ?? null;

/** Where the agent's circle sits, in pixels. */
export interface Circle { cx: number; cy: number; d: number }

// ── Type ───────────────────────────────────────────────────────────────────────
type Face = "display" | "text" | "condensed";
const faces: Partial<Record<Face, opentypeNs.Font>> = {};
// Literal paths so the deployment's file tracer bundles these (see image-render.ts).
function font(face: Face): opentypeNs.Font {
  const f = faces[face];
  if (f) return f;
  const buf = face === "text"
    ? readFileSync(path.join(process.cwd(), "fonts", "Montserrat-SemiBold.ttf"))
    : face === "condensed"
      ? readFileSync(path.join(process.cwd(), "fonts", "Anton-Regular.ttf"))
      : readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
  const parsed = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  faces[face] = parsed;
  return parsed;
}
const width = (t: string, size: number, face: Face, spacing = 0) => font(face).getAdvanceWidth(t, size) + spacing * Math.max(0, Array.from(t).length - 1);

/** One line of real type. anchor: where x is. spacing: extra pixels between letters. */
function line(t: string, x: number, y: number, size: number, fill: string, face: Face, anchor: "start" | "middle" | "end" = "start", spacing = 0): string {
  if (!t) return "";
  const w = width(t, size, face, spacing);
  let cx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  if (!spacing) return `<path d="${glyphPathData(font(face).getPath(t, cx, y, size))}" fill="${fill}"/>`;
  const out: string[] = [];
  for (const ch of Array.from(t)) {
    if (ch.trim()) out.push(`<path d="${glyphPathData(font(face).getPath(ch, cx, y, size))}" fill="${fill}"/>`);
    cx += font(face).getAdvanceWidth(ch, size) + spacing;
  }
  return out.join("");
}
/** The largest size (down to min) at which t fits in maxW on one line. */
function fit(t: string, maxW: number, start: number, min: number, face: Face, spacing = 0): number {
  let s = start;
  while (s > min && width(t, s, face, spacing) > maxW) s -= 1;
  return s;
}
/** Wraps t into at most maxLines lines that fit maxW, shrinking down to min. */
function wrap(t: string, maxW: number, start: number, min: number, maxLines: number, face: Face): { size: number; lines: string[] } {
  for (let s = start; ; s -= 1) {
    const words = t.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && width(next, s, face) > maxW) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    if ((lines.length <= maxLines && lines.every((l) => width(l, s, face) <= maxW)) || s <= min) return { size: s, lines: lines.slice(0, maxLines) };
  }
}
const ink = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150 ? "#14100a" : "#ffffff";
};

// ── Layouts ────────────────────────────────────────────────────────────────────
export interface Layout { circle: Circle; svg: string; ring: string }

/**
 * Everything for one design in one shape: the agent's circle and the words.
 * accent: the agent's first brand color, or gold.
 */
export function layout(id: DesignId, shape: Shape, f: Record<string, string>, accent = "#e7b84a"): Layout {
  const { w: W, h: H } = SIZE[shape];
  const v = shape === "vertical";
  // Any "$160000" typed without commas is shown as "$160,000".
  const g = (k: string) => (f[k] ?? "").trim().replace(/\$(\d{4,})(?![\d,])/g, (_, n: string) => `$${Number(n).toLocaleString("en-US")}`);
  // Each piece in its own named group, so the animated version can move it (2026-11-03).
  const order: string[] = [];
  const groups: Record<string, string[]> = {};
  const put = (gid: string, ...svg: string[]) => {
    if (!groups[gid]) { groups[gid] = []; order.push(gid); }
    groups[gid].push(...svg);
  };
  let circle: Circle;
  let ring = accent;
  const defs: string[] = [];
  // The background color the agent picked (2026-11-03), else each design's own shade.
  const S = shadeOf(f.bg, accent);
  const sh = (own: string) => S ?? own;
  // On their own brand color, the brand-colored words are lightened so they still stand out.
  if (f.bg === "brand" && S) accent = lighten(accent, 0.55);
  /** Name · brokerage, then the phones underneath, at (x, y). */
  const contact = (x: number, y: number, anchor: "start" | "middle" | "end", maxW: number, size: number) => {
    let yy = y;
    const a = g("agent"), p = g("phones");
    if (a) { const s = fit(a, maxW, size, 12, "text"); put("contact", line(a, x, yy, s, "#ffffff", "text", anchor)); yy += s * 1.4; }
    if (p) { const s = fit(p, maxW, size * 0.9, 11, "text"); put("contact", line(p, x, yy, s, "#e6dfd2", "text", anchor)); }
  };

  if (id === "just_listed") {
    // Gold label top-left.
    const ks = v ? 40 : 46;
    const kt = g("headline") || "JUST LISTED";
    const kw = width(kt, ks, "display", 2) + ks * 1.1;
    put("label", `<rect x="${W * 0.05}" y="${H * (v ? 0.05 : 0.07)}" width="${kw}" height="${ks * 1.6}" rx="${ks * 0.18}" fill="${accent}"/>`);
    put("label", line(kt, W * 0.05 + ks * 0.55, H * (v ? 0.05 : 0.07) + ks * 1.17, ks, ink(accent), "display", "start", 2));
    // Dark fade under the words.
    defs.push(`<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh("#000")}" stop-opacity="0"/><stop offset="0.45" stop-color="${sh("#000")}" stop-opacity="0.72"/><stop offset="1" stop-color="${sh("#000")}" stop-opacity="0.86"/></linearGradient>`);
    if (v) {
      put("fade", `<rect x="0" y="${H * 0.6}" width="${W}" height="${H * 0.4}" fill="url(#fade)"/>`);
      circle = { cx: W * 0.5, cy: H * 0.6, d: W * 0.42 };
      // One line after another, so a two-line address pushes the rest down
      // instead of running into it.
      const x = W / 2, maxW = W * 0.88;
      const a = wrap(g("address"), maxW, 44, 28, 2, "display");
      let y = H * 0.785;
      a.lines.forEach((l, i) => put("addr", line(l, x, y + i * a.size * 1.12, a.size, "#fff", "display", "middle")));
      y += (a.lines.length - 1) * a.size * 1.12;
      const ps = fit(g("price"), maxW, 64, 36, "display");
      y += ps * 1.08;
      put("price", line(g("price"), x, y, ps, accent, "display", "middle"));
      const ds = fit(g("details"), maxW, 26, 16, "text");
      if (g("details")) { y += ds * 1.7; put("details", line(g("details"), x, y, ds, "#f1ece2", "text", "middle")); }
      contact(x, Math.min(y + 40, H * 0.945), "middle", maxW, 22);
    } else {
      put("fade", `<rect x="0" y="${H * 0.56}" width="${W}" height="${H * 0.44}" fill="url(#fade)"/>`);
      circle = { cx: W * 0.135, cy: H - W * 0.03 - W * 0.095, d: W * 0.19 };
      const x0 = W * 0.27, maxW = W - x0 - W * 0.04;
      put("addr", line(g("address"), x0, H * 0.79, fit(g("address"), maxW, 54, 28, "display"), "#fff", "display"));
      put("price", line(g("price"), x0, H * 0.895, fit(g("price"), maxW, 72, 36, "display"), accent, "display"));
      put("details", line(g("details"), x0, H * 0.955, fit(g("details"), maxW * 0.56, 26, 16, "text"), "#f1ece2", "text"));
      contact(W * 0.96, H * 0.918, "end", maxW * 0.42, 20);
    }
  } else if (id === "luxury") {
    const bar = v ? H * 0.1 : H * 0.16;
    // A soft dark band behind the address, so it reads over a bright room.
    defs.push(`<radialGradient id="lxband" cx="0.5" cy="${v ? 0.4 : 0.47}" r="${v ? 0.6 : 0.55}"><stop offset="0" stop-color="${sh("#000")}" stop-opacity="0.5"/><stop offset="1" stop-color="${sh("#000")}" stop-opacity="0.15"/></radialGradient>`);
    put("band", `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#lxband)"/>`);
    put("bartop", `<rect x="0" y="0" width="${W}" height="${bar}" fill="${sh("#0d0b09")}"/>`);
    put("barbot", `<rect x="0" y="${H - bar}" width="${W}" height="${bar}" fill="${sh("#0d0b09")}"/>`);
    const kt = (g("headline") || "Luxury Listing").toUpperCase();
    put("kicker", line(kt, W / 2, bar * 0.62, fit(kt, W * 0.9, v ? 26 : 30, 16, "text", 6), accent, "text", "middle", 6));
    const a = wrap(g("address"), W * 0.86, v ? 56 : 64, 30, 2, "text");
    const ay = H * (v ? 0.36 : 0.44) - ((a.lines.length - 1) * a.size * 0.55);
    a.lines.forEach((l, i) => put("addr", line(l, W / 2, ay + i * a.size * 1.15, a.size, "#fff", "text", "middle")));
    const p = g("price").toUpperCase();
    put("price", line(p, W / 2, ay + a.lines.length * a.size * 1.15 + (v ? 40 : 34), fit(p, W * 0.86, v ? 28 : 30, 16, "text", 8), "#fff", "text", "middle", 8));
    const d = g("details").toUpperCase();
    put("details", line(d, W / 2, H - bar + bar * 0.32, fit(d, W * 0.9, v ? 22 : 22, 13, "text", 5), "#d8cdb8", "text", "middle", 5));
    contact(W / 2, H - bar + bar * (v ? 0.6 : 0.6), "middle", W * 0.9, v ? 19 : 17);
    const cd = v ? W * 0.34 : W * 0.14;
    circle = { cx: W - W * 0.04 - cd / 2, cy: H - bar - W * 0.025 - cd / 2, d: cd };
  } else if (id === "market_update") {
    const stats = [1, 2, 3].map((i) => ({ v: g(`s${i}`), l: g(`s${i}l`), c: g(`s${i}c`) })).filter((s) => s.v);
    const changeColor = (c: string) => (/^\s*(-|down)/i.test(c) ? "#ff8a80" : "#6fd39a");
    if (v) {
      defs.push(`<linearGradient id="pan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh("#0e121a")}" stop-opacity="0.96"/><stop offset="0.8" stop-color="${sh("#0e121a")}" stop-opacity="0.9"/><stop offset="1" stop-color="${sh("#0e121a")}" stop-opacity="0"/></linearGradient>`);
      put("panel", `<rect x="0" y="0" width="${W}" height="${H * 0.56}" fill="url(#pan)"/>`);
      const x = W * 0.07;
      put("kicker", line(g("headline").toUpperCase(), x, H * 0.07, fit(g("headline").toUpperCase(), W * 0.86, 26, 16, "text", 3), accent, "text", "start", 3));
      const t = wrap(g("title"), W * 0.86, 56, 30, 2, "display");
      t.lines.forEach((l, i) => put("title", line(l, x, H * 0.13 + i * t.size * 1.1, t.size, "#fff", "display")));
      const ty = H * 0.13 + t.lines.length * t.size * 1.1 + 20;
      const tw = (W * 0.86 - 2 * 16) / 3;
      stats.forEach((s, i) => {
        const sx = x + i * (tw + 16);
        put(`stat${i}`, `<rect x="${sx}" y="${ty}" width="${tw}" height="${H * 0.15}" rx="16" fill="#fff" fill-opacity="0.08" stroke="#fff" stroke-opacity="0.18"/>`);
        put(`stat${i}`, line(s.v, sx + 14, ty + 62, fit(s.v, tw - 28, 46, 22, "display"), "#fff", "display"));
        put(`stat${i}`, line(s.l, sx + 14, ty + 100, fit(s.l, tw - 28, 20, 12, "text"), "#c9cfdb", "text"));
        put(`stat${i}`, line(s.c, sx + 14, ty + 132, fit(s.c, tw - 28, 20, 12, "text"), changeColor(s.c), "text"));
      });
      circle = { cx: W / 2, cy: H * 0.73, d: W * 0.46 };
      defs.push(`<linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh("#000")}" stop-opacity="0"/><stop offset="1" stop-color="${sh("#000")}" stop-opacity="0.8"/></linearGradient>`);
      put("foot", `<rect x="0" y="${H * 0.84}" width="${W}" height="${H * 0.16}" fill="url(#foot)"/>`);
      contact(W / 2, H * 0.93, "middle", W * 0.88, 24);
    } else {
      defs.push(`<linearGradient id="pan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sh("#0e121a")}" stop-opacity="0.96"/><stop offset="0.72" stop-color="${sh("#0e121a")}" stop-opacity="0.92"/><stop offset="1" stop-color="${sh("#0e121a")}" stop-opacity="0"/></linearGradient>`);
      put("panel", `<rect x="0" y="0" width="${W * 0.62}" height="${H}" fill="url(#pan)"/>`);
      const x = W * 0.045, maxW = W * 0.5;
      put("kicker", line(g("headline").toUpperCase(), x, H * 0.14, fit(g("headline").toUpperCase(), maxW, 24, 14, "text", 3), accent, "text", "start", 3));
      const t = wrap(g("title"), maxW, 58, 30, 2, "display");
      t.lines.forEach((l, i) => put("title", line(l, x, H * 0.27 + i * t.size * 1.08, t.size, "#fff", "display")));
      const ty = H * 0.27 + t.lines.length * t.size * 1.08 + 24;
      const tw = (maxW - 2 * 14) / 3;
      stats.forEach((s, i) => {
        const sx = x + i * (tw + 14);
        put(`stat${i}`, `<rect x="${sx}" y="${ty}" width="${tw}" height="${H * 0.3}" rx="14" fill="#fff" fill-opacity="0.08" stroke="#fff" stroke-opacity="0.18"/>`);
        put(`stat${i}`, line(s.v, sx + 14, ty + 66, fit(s.v, tw - 28, 48, 22, "display"), "#fff", "display"));
        put(`stat${i}`, line(s.l, sx + 14, ty + 104, fit(s.l, tw - 28, 19, 12, "text"), "#c9cfdb", "text"));
        put(`stat${i}`, line(s.c, sx + 14, ty + 140, fit(s.c, tw - 28, 19, 12, "text"), changeColor(s.c), "text"));
      });
      circle = { cx: W * 0.8, cy: H * 0.6, d: W * 0.3 };
      contact(x, H * 0.885, "start", maxW, 20);
    }
  } else if (id === "neighborhood") {
    defs.push(`<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh("#000")}" stop-opacity="0"/><stop offset="1" stop-color="${sh("#000")}" stop-opacity="0.8"/></linearGradient>`);
    put("fade", `<rect x="0" y="${H * 0.45}" width="${W}" height="${H * 0.55}" fill="url(#fade)"/>`);
    // A soft dark top for the contact block.
    defs.push(`<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh("#000")}" stop-opacity="0.6"/><stop offset="1" stop-color="${sh("#000")}" stop-opacity="0"/></linearGradient>`);
    put("top", `<rect x="0" y="0" width="${W}" height="${H * (v ? 0.2 : 0.26)}" fill="url(#top)"/>`);
    const kt = (g("headline") || "Neighborhood Spotlight").toUpperCase();
    const ks = v ? 24 : 22;
    const kw = width(kt, ks, "text", 3) + ks * 1.6;
    put("kicker", `<rect x="${W * 0.05}" y="${H * 0.05}" width="${kw}" height="${ks * 2}" rx="${ks}" fill="#fff"/>`);
    put("kicker", line(kt, W * 0.05 + ks * 0.8, H * 0.05 + ks * 1.36, ks, "#14100a", "text", "start", 3));
    const hl = g("highlights").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
    const cs = v ? 24 : 22;
    if (v) {
      const n = wrap(g("name"), W * 0.88, 104, 44, 2, "display");
      n.lines.forEach((l, i) => put("name", line(l, W * 0.06, H * 0.8 + i * n.size, n.size, "#fff", "display")));
      let cy = H * 0.8 + n.lines.length * n.size + 10, cx = W * 0.06;
      hl.forEach((h, ci) => {
        const cw = width(h, cs, "text") + cs * 1.6;
        if (cx + cw > W * 0.94) { cx = W * 0.06; cy += cs * 2.4; }
        put(`chip${ci}`, `<rect x="${cx}" y="${cy}" width="${cw}" height="${cs * 1.9}" rx="${cs}" fill="#fff" fill-opacity="0.18" stroke="#fff" stroke-opacity="0.45"/>`);
        put(`chip${ci}`, line(h, cx + cs * 0.8, cy + cs * 1.3, cs, "#fff", "text"));
        cx += cw + 10;
      });
      // Lower than the contact lines, so they never run under it.
      circle = { cx: W * 0.72, cy: H * 0.36, d: W * 0.42 };
      contact(W * 0.06, H * 0.115, "start", W * 0.88, 22);
    } else {
      put("name", line(g("name"), W * 0.045, H * 0.8, fit(g("name"), W * 0.68, 104, 40, "display"), "#fff", "display"));
      let cx = W * 0.045;
      hl.forEach((h, ci) => {
        const cw = width(h, cs, "text") + cs * 1.6;
        put(`chip${ci}`, `<rect x="${cx}" y="${H * 0.86}" width="${cw}" height="${cs * 1.9}" rx="${cs}" fill="#fff" fill-opacity="0.18" stroke="#fff" stroke-opacity="0.45"/>`);
        put(`chip${ci}`, line(h, cx + cs * 0.8, H * 0.86 + cs * 1.3, cs, "#fff", "text"));
        cx += cw + 12;
      });
      const cd = W * 0.18;
      circle = { cx: W - W * 0.04 - cd / 2, cy: H - W * 0.04 - cd / 2, d: cd };
      contact(W * 0.96, H * 0.085, "end", W * 0.45, 20);
    }
    ring = "#ffffff";
  } else {
    // agent_intro: the background is drawn here too, with a hole for the agent's
    // circle, so a new color can be laid on later without a new video (2026-11-03).
    circle = v ? { cx: W / 2, cy: H * 0.3, d: W * 0.62 } : { cx: W * 0.24, cy: H * 0.5, d: W * 0.34 };
    const hr = circle.d / 2 - 1;
    const holed = `M0 0H${W}V${H}H0Z M${circle.cx - hr} ${circle.cy} a${hr} ${hr} 0 1 0 ${2 * hr} 0 a${hr} ${hr} 0 1 0 ${-2 * hr} 0Z`;
    const [b0, b1] = S ? [darken(S, 0.45), S] : ["#16120d", "#3a2a14"];
    defs.push(`<linearGradient id="ib" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b0}"/><stop offset="1" stop-color="${b1}"/></linearGradient><radialGradient id="ir" cx="0.25" cy="0.4" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`);
    put("bg", `<path d="${holed}" fill-rule="evenodd" fill="url(#ib)"/><path d="${holed}" fill-rule="evenodd" fill="url(#ir)"/>`);
    if (v) {
      const x = W / 2;
      put("kicker", line(g("headline").toUpperCase(), x, H * 0.57, fit(g("headline").toUpperCase(), W * 0.86, 28, 16, "text", 4), accent, "text", "middle", 4));
      put("name", line(g("name"), x, H * 0.65, fit(g("name"), W * 0.9, 76, 36, "display"), "#fff", "display", "middle"));
      const r = wrap(g("role"), W * 0.86, 30, 18, 2, "text");
      r.lines.forEach((l, i) => put("role", line(l, x, H * 0.705 + i * r.size * 1.3, r.size, "#e9dcc3", "text", "middle")));
      put("phones", line(g("phones"), x, H * 0.81, fit(g("phones"), W * 0.88, 30, 16, "text"), "#fff", "text", "middle"));
      put("website", line(g("website"), x, H * 0.86, fit(g("website"), W * 0.86, 28, 16, "text"), "#fff", "text", "middle"));
    } else {
      const x = W * 0.46, maxW = W * 0.5;
      put("kicker", line(g("headline").toUpperCase(), x, H * 0.3, fit(g("headline").toUpperCase(), maxW, 28, 14, "text", 4), accent, "text", "start", 4));
      put("name", line(g("name"), x, H * 0.43, fit(g("name"), maxW, 80, 34, "display"), "#fff", "display"));
      const r = wrap(g("role"), maxW, 30, 16, 2, "text");
      r.lines.forEach((l, i) => put("role", line(l, x, H * 0.52 + i * r.size * 1.3, r.size, "#e9dcc3", "text")));
      put("phones", line(g("phones"), x, H * 0.7, fit(g("phones"), maxW, 28, 14, "text"), "#fff", "text"));
      put("website", line(g("website"), x, H * 0.78, fit(g("website"), maxW, 28, 14, "text"), "#fff", "text"));
    }
  }

  // The ring around the agent's circle, drawn with the words.
  const rw = Math.max(4, Math.round(circle.d * 0.025));
  const ringSvg = `<circle id="ring" cx="${circle.cx}" cy="${circle.cy}" r="${circle.d / 2 + rw / 2}" fill="none" stroke="${ring}" stroke-width="${rw}" transform="rotate(-90 ${circle.cx} ${circle.cy})"/>`;
  const body = order.map((gid) => `<g id="${gid}">${groups[gid].join("")}</g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join("")}</defs>${body}${ringSvg}</svg>`;
  return { circle, svg, ring: ringSvg };
}

/** The words layer as a see-through PNG, with the logo placed for Agent Introduction. */
export async function wordsLayer(id: DesignId, shape: Shape, f: Record<string, string>, accent?: string, logo?: Buffer | null): Promise<{ png: Buffer; circle: Circle }> {
  const { svg, circle } = layout(id, shape, f, accent);
  const base = sharp(Buffer.from(svg));
  if (id === "agent_intro" && logo) {
    const { w: W, h: H } = SIZE[shape];
    const lw = Math.round(shape === "vertical" ? W * 0.32 : W * 0.14);
    const lp = await sharp(logo).resize({ width: lw, height: Math.round(lw * 0.5), fit: "inside" }).png().toBuffer();
    const meta = await sharp(lp).metadata();
    const top = shape === "vertical" ? Math.round(H * 0.9) : Math.round(H * 0.06);
    const left = shape === "vertical" ? Math.round((W - (meta.width ?? lw)) / 2) : Math.round(W - W * 0.04 - (meta.width ?? lw));
    return { png: await base.composite([{ input: lp, top, left }]).png().toBuffer(), circle };
  }
  return { png: await base.png().toBuffer(), circle };
}

/** Agent Introduction's background: a dark warm gradient tinted with the accent. */
export async function introBackground(shape: Shape, accent = "#e7b84a"): Promise<Buffer> {
  const { w: W, h: H } = SIZE[shape];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16120d"/><stop offset="1" stop-color="#3a2a14"/></linearGradient><radialGradient id="r" cx="0.25" cy="0.4" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#b)"/><rect width="${W}" height="${H}" fill="url(#r)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** (610) 457-8698 from any way a 10-digit US number was typed; anything else as typed. */
export function formatPhone(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  const d = t.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : t;
}

/** Sensible starting words from the agent's profile and (optionally) a listing. */
export function defaultFields(id: DesignId, p: {
  name?: string | null; mobile?: string | null; office?: string | null; company?: string | null; website?: string | null; city?: string | null; state?: string | null;
}, listing?: { address?: string; price?: string | number; beds?: string | number; baths?: string | number; sqft?: string | number } | null): Record<string, string> {
  const town = p.city || "Springfield";
  const price = listing?.price ? (typeof listing.price === "number" ? `$${listing.price.toLocaleString("en-US")}` : String(listing.price)) : "";
  const details = [listing?.beds && `${listing.beds} beds`, listing?.baths && `${listing.baths} baths`, listing?.sqft && `${Number(listing.sqft).toLocaleString("en-US")} sq ft`].filter(Boolean).join(" · ");
  // Name and brokerage, then both phones (2026-11-03, the owner's ask).
  const agent = [p.name, p.company].filter(Boolean).join(" · ");
  const mobile = formatPhone(p.mobile), office = formatPhone(p.office);
  const phones = [mobile && `Mobile ${mobile}`, office && office !== mobile && `Office ${office}`].filter(Boolean).join(" · ");
  const contact = { agent, phones };
  const month = new Date().toLocaleString("en-US", { month: "long" });
  switch (id) {
    case "just_listed": return { headline: "JUST LISTED", address: listing?.address ?? "", price, details, ...contact };
    case "luxury": return { headline: "Luxury Listing", address: listing?.address ?? "", price: price ? `Offered at ${price}` : "", details, ...contact };
    case "market_update": return { headline: `Market Update · ${month}`, title: `${town} Housing Market`, s1: "", s1l: "Median price", s1c: "", s2: "", s2l: "Days on market", s2c: "", s3: "", s3l: "Homes sold", s3c: "", ...contact };
    case "neighborhood": return { headline: "Neighborhood Spotlight", name: town, highlights: "", ...contact };
    default: return { headline: "Meet your agent", name: p.name ?? "", role: [p.city ? `Your ${p.city} REALTOR®` : "REALTOR®", p.company].filter(Boolean).join(" · "), phones, website: (p.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "") };
  }
}
