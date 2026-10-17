import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import { glyphPathData } from "@/lib/utils/glyph-path-data";
import { resolvePalette } from "@/lib/utils/banner-render";
import type { BannerCustomColors } from "@/lib/utils/banner-colors";
import { emptyScene, sceneToPdf, type BannerScene, type SceneImage, type SceneText } from "@/lib/utils/banner-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The YouTube channel banner, everything inside the safe zone (2026-10-16,
 * the owner's ask).
 *
 * YouTube's banner is 2560×1440, but only the centre 1546×423 shows on every
 * device: a phone shows little more than that strip, a TV the whole canvas.
 * The template before this spread across the full canvas on purpose, so on a
 * phone most of it was cut away. This one puts the agent's photo, name,
 * brokerage, tagline, contact line and logo inside the strip, and leaves the
 * rest as background only.
 */

const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

const W = 2560;
const H = 1440;
/** YouTube's safe area, centred. */
const SAFE_W = 1546;
const SAFE_H = 423;
const SAFE_X = Math.round((W - SAFE_W) / 2);
const SAFE_Y = Math.round((H - SAFE_H) / 2);
/** Breathing room inside the safe area, so nothing touches its edge. */
const PAD = 28;
const BOX_X = SAFE_X + PAD;
const BOX_Y = SAFE_Y + PAD;
const BOX_W = SAFE_W - PAD * 2;
const BOX_H = SAFE_H - PAD * 2;

/** Heavy face for the name and tagline; Montserrat for the rest, which keeps an email's case readable. */
let _heavy: opentypeNs.Font | null = null;
let _plain: opentypeNs.Font | null = null;
function font(kind: "heavy" | "plain"): opentypeNs.Font {
  const load = (file: string) => {
    const buf = readFileSync(path.join(process.cwd(), "fonts", file));
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
  if (kind === "heavy") return (_heavy ??= load("ArchivoBlack-Regular.ttf"));
  return (_plain ??= load("Montserrat-SemiBold.ttf"));
}
const widthOf = (kind: "heavy" | "plain", text: string, size: number) => font(kind).getAdvanceWidth(text, size);

/** Largest size from `start` down to `min` at which `text` fits `maxW`; null if even `min` is too wide. */
function fit(kind: "heavy" | "plain", text: string, maxW: number, start: number, min: number): number | null {
  for (let s = start; s >= min; s -= 2) if (widthOf(kind, text, s) <= maxW) return s;
  return null;
}

/** One line as one path per word: librsvg truncates a very long single path. */
function linePaths(kind: "heavy" | "plain", line: string, x: number, y: number, size: number, fill: string): string {
  const f = font(kind);
  const space = f.getAdvanceWidth(" ", size);
  let cx = x;
  const out: string[] = [];
  for (const word of line.split(" ")) {
    if (word) out.push(`<path d="${glyphPathData(f.getPath(word, cx, y, size))}" fill="${fill}"/>`);
    cx += f.getAdvanceWidth(word, size) + space;
  }
  return out.join("");
}

export interface YouTubeBannerOptions {
  name?: string;
  brokerage?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** The agent's headshot, drawn in a circle on the left. */
  photoUrl?: string;
  /** The agent's logo, drawn on a white card on the right. */
  logoUrl?: string;
  palette?: string;
  customColors?: Partial<BannerCustomColors> | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sharp = any;

async function fetchImage(url: string | undefined): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** The headshot, filled into a circle with a white ring. */
async function circlePhoto(sharp: Sharp, src: Buffer, d: number, ring: number): Promise<Buffer | null> {
  try {
    const inner = d - ring * 2;
    const face = await sharp(src).rotate().resize(inner, inner, { fit: "cover", position: "attention" }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}" fill="#fff"/></svg>`);
    const round = await sharp(face).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    const ringSvg = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#ffffff"/></svg>`);
    return await sharp(ringSvg).composite([{ input: round, left: ring, top: ring }]).png().toBuffer();
  } catch {
    return null;
  }
}

/** The logo, fitted whole onto a white rounded card so any logo reads on any background. */
async function logoCard(sharp: Sharp, src: Buffer, maxW: number, maxH: number): Promise<{ png: Buffer; w: number; h: number } | null> {
  try {
    const inset = 26;
    const logo = await sharp(src).rotate().resize(maxW - inset * 2, maxH - inset * 2, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(logo).metadata();
    const w = (meta.width ?? 0) + inset * 2;
    const h = (meta.height ?? 0) + inset * 2;
    const card = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="22" ry="22" fill="#ffffff"/></svg>`);
    const png = await sharp(card).composite([{ input: logo, left: inset, top: inset }]).png().toBuffer();
    return { png, w, h };
  } catch {
    return null;
  }
}

export async function renderYouTubeBanner(opts: YouTubeBannerOptions): Promise<{ png: Buffer; scene: BannerScene }> {
  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;
  const pal = resolvePalette(opts);
  const clean = (v?: string) => (v ?? "").replace(/\s+/g, " ").trim();

  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${pal.gradLeft}"/><stop offset="100%" stop-color="${pal.gradRight}"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`;
  const base = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  const composites: { input: Buffer; left: number; top: number }[] = [];
  const images: SceneImage[] = [];
  const texts: SceneText[] = [];
  const parts: string[] = [];

  // Photo on the left, the full height of the box.
  let textLeft = BOX_X;
  const [photoSrc, logoSrc] = await Promise.all([fetchImage(opts.photoUrl), fetchImage(opts.logoUrl)]);
  if (photoSrc) {
    const d = BOX_H;
    const png = await circlePhoto(sharp, photoSrc, d, 10);
    if (png) {
      composites.push({ input: png, left: BOX_X, top: BOX_Y });
      images.push({ png, x: BOX_X, y: BOX_Y, w: d, h: d });
      textLeft = BOX_X + d + 56;
    }
  }

  // Logo on the right, centred on the box's height.
  let textRight = BOX_X + BOX_W;
  if (logoSrc) {
    const card = await logoCard(sharp, logoSrc, 400, 260);
    if (card) {
      const x = BOX_X + BOX_W - card.w;
      const y = BOX_Y + Math.round((BOX_H - card.h) / 2);
      composites.push({ input: card.png, left: x, top: y });
      images.push({ png: card.png, x, y, w: card.w, h: card.h });
      textRight = x - 56;
    }
  }

  // The text column: name, brokerage, tagline, contact. Each line is sized
  // to fit the column, so a long name or email shrinks rather than leaving
  // the safe zone.
  const colW = Math.max(200, textRight - textLeft);
  type Line = { kind: "heavy" | "plain"; text: string; size: number; color: string; gapBefore: number };

  /** Greedy word wrap at `size`. */
  const wrap = (kind: "heavy" | "plain", text: string, size: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const w of text.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && widthOf(kind, next, size) > colW) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  /** Cut one line to fit, with an ellipsis: only for text too long for two lines at the smallest size. */
  const cut = (kind: "heavy" | "plain", text: string, size: number): string => {
    if (widthOf(kind, text, size) <= colW) return text;
    let s = text;
    while (s.length > 1 && widthOf(kind, `${s}…`, size) > colW) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };

  /**
   * The whole stack at a given scale. Each piece takes the biggest size at
   * which it fits in `maxLines` lines, wrapping rather than cutting; only if
   * even that fails is the last line cut short.
   */
  const build = (scale: number): Line[] => {
    const lines: Line[] = [];
    const add = (
      kind: "heavy" | "plain", text: string, start: number, min: number,
      maxLines: number, color: string, gapBefore: number,
    ) => {
      if (!text) return;
      const s0 = Math.round(start * scale);
      const s1 = Math.max(20, Math.round(min * scale));
      for (let size = s0; size >= s1; size -= 2) {
        const w = wrap(kind, text, size);
        if (w.length <= maxLines && w.every((l) => widthOf(kind, l, size) <= colW)) {
          w.forEach((l, i) => lines.push({ kind, text: l, size, color, gapBefore: i === 0 ? gapBefore : Math.round(size * 0.12) }));
          return;
        }
      }
      const w = wrap(kind, text, s1).slice(0, maxLines);
      w[w.length - 1] = cut(kind, wrap(kind, text, s1).slice(maxLines - 1).join(" "), s1);
      w.forEach((l, i) => lines.push({ kind, text: cut(kind, l, s1), size: s1, color, gapBefore: i === 0 ? gapBefore : Math.round(s1 * 0.12) }));
    };

    add("heavy", clean(opts.name).toUpperCase(), 104, 36, 2, pal.navy, 0);
    add("plain", clean(opts.brokerage), 48, 28, 2, pal.navy, Math.round(14 * scale));
    add("heavy", clean(opts.tagline).toUpperCase(), 54, 28, 2, pal.royal, Math.round(22 * scale));

    // Contact: one line if it fits at a readable size, otherwise two.
    const contact = [clean(opts.phone), clean(opts.email), clean(opts.website)].filter(Boolean);
    if (contact.length) {
      const one = contact.join("  ·  ");
      if (fit("plain", one, colW, Math.round(40 * scale), Math.round(30 * scale))) {
        add("plain", one, 40, 30, 1, pal.navy, Math.round(22 * scale));
      } else {
        add("plain", [clean(opts.phone), clean(opts.website)].filter(Boolean).join("  ·  "), 40, 24, 1, pal.navy, Math.round(22 * scale));
        add("plain", clean(opts.email), 40, 24, 1, pal.navy, Math.round(8 * scale));
      }
    }
    return lines;
  };
  const heightOf = (ls: Line[]) => ls.reduce((h, l) => h + l.gapBefore + l.size, 0);
  // Shrink the whole stack together until it fits the box's height.
  let lines = build(1);
  for (let scale = 0.92; heightOf(lines) > BOX_H && scale > 0.5; scale -= 0.08) lines = build(scale);

  // Centre the stack on the box's height. Line height is the font size;
  // the baseline sits about 80% of the way down each line.
  const total = heightOf(lines);
  let y = BOX_Y + Math.max(0, (BOX_H - total) / 2);
  for (const l of lines) {
    y += l.gapBefore;
    const baseline = Math.round(y + l.size * 0.8);
    parts.push(linePaths(l.kind, l.text, textLeft, baseline, l.size, l.color));
    texts.push({ text: l.text, x: textLeft, baseline, size: l.size, color: l.color });
    y += l.size;
  }

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
  const png = await sharp(base)
    .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }, ...composites])
    .png({ compressionLevel: 6 })
    .toBuffer();

  const scene = { ...emptyScene(W, H, pal.gradLeft, pal.gradRight, base), texts, images, shapes: [] };
  return { png, scene };
}

/**
 * Renders, uploads the PNG and its Canva PDF to the public `assets` bucket,
 * and returns both URLs. A failed PDF still returns the banner.
 */
export async function renderAndSaveYouTubeBanner(
  userId: string,
  opts: YouTubeBannerOptions,
): Promise<{ url: string; pdfUrl?: string }> {
  const { png, scene } = await renderYouTubeBanner(opts);
  const admin = createAdminClient();
  const base = `banners/${userId}/banner_${Date.now()}`;
  const { error: uploadErr } = await admin.storage
    .from("assets")
    .upload(`${base}.png`, png, { contentType: "image/png", upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);
  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(`${base}.png`);

  let pdfUrl: string | undefined;
  try {
    const pdf = await sceneToPdf(scene, "YouTube banner");
    const { error } = await admin.storage
      .from("assets")
      .upload(`${base}.pdf`, pdf, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
    pdfUrl = admin.storage.from("assets").getPublicUrl(`${base}.pdf`).data.publicUrl;
  } catch (e) {
    console.error("[youtube-banner] Canva PDF failed:", e instanceof Error ? e.message : e);
  }
  return { url: publicUrl, pdfUrl };
}
