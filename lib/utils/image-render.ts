import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageBackground } from "@/lib/api/openai-image";
import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import { glyphPathData } from "@/lib/utils/glyph-path-data";

// Same defensive resolution as thumbnail-render.ts: the UMD package lands on
// the namespace or on .default depending on how the server bundle resolves it.
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

/**
 * The Spark Tools image generator's renderer.
 *
 * Two steps, stored separately, so that a text edit never pays for a new
 * background: makeBackground() produces and uploads the picture, renderImage()
 * draws the words, logo and headshot over a background URL. "Edit text" calls
 * only the second.
 *
 * Every word is vector outlines from a bundled font, one <path> per word.
 * Vercel has no system fonts, and librsvg silently truncates a path whose `d`
 * grows past about 5k characters (see banner-render.ts).
 */

export const IMAGE_SHAPES = {
  post_4x5:   { w: 1080, h: 1350, orientation: "portrait" as const },
  story_9x16: { w: 1080, h: 1920, orientation: "portrait" as const },
  wide_16x9:  { w: 1920, h: 1080, orientation: "landscape" as const },
};
export type ImageShape = keyof typeof IMAGE_SHAPES;

export const IMAGE_TEMPLATES = ["just_listed", "open_house", "market_update", "blog_header", "blank"] as const;
export type ImageTemplate = (typeof IMAGE_TEMPLATES)[number];

export interface ImageText {
  kicker?: string;
  headline?: string;
  subline?: string;
  /** #rrggbb for the kicker pill. */
  accent?: string;
  showLogo?: boolean;
  showHeadshot?: boolean;
}

let _font: opentypeNs.Font | null = null;
function getFont(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

function textWidth(text: string, size: number): number {
  return getFont().getAdvanceWidth(text, size);
}

/** One path per word, laid out by advance width. */
function lineToPaths(line: string, x: number, y: number, size: number, fill: string): string {
  const space = textWidth(" ", size);
  let cx = x;
  const out: string[] = [];
  for (const word of line.split(" ")) {
    if (word) out.push(`<path d="${glyphPathData(getFont().getPath(word, cx, y, size))}" fill="${fill}"/>`);
    cx += textWidth(word, size) + space;
  }
  return out.join("");
}

function wrapLines(text: string, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(t, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Largest size (down to `min`) at which the text wraps into `maxLines` that all fit. */
function fitWrapped(text: string, maxWidth: number, start: number, min: number, maxLines: number) {
  let size = start;
  for (;;) {
    const lines = wrapLines(text, size, maxWidth);
    const fits = lines.length <= maxLines && lines.every((l) => textWidth(l, size) <= maxWidth);
    if (fits || size <= min) return { size, lines: lines.slice(0, maxLines) };
    size -= 2;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Dark text on a light accent, white on a dark one. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111827" : "#ffffff";
}

function publicUrl(admin: ReturnType<typeof createAdminClient>, p: string): string {
  return admin.storage.from("assets").getPublicUrl(p).data.publicUrl;
}

/**
 * The picture under the words. An agent's own photo when one is given (free),
 * else an AI photograph (counted), else a plain dark gradient (free, and what
 * everyone gets until an image key is configured).
 */
export async function makeBackground(opts: {
  userId: string;
  template: ImageTemplate;
  shape: ImageShape;
  scene?: string;
  city?: string;
  state?: string;
  variant: number;
  photoUrl?: string;
}): Promise<{ url: string; ai: boolean }> {
  const admin = createAdminClient();
  const { w, h, orientation } = IMAGE_SHAPES[opts.shape];
  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;

  let buffer: Buffer | null = null;
  let ai = false;

  if (opts.photoUrl) {
    const res = await fetch(opts.photoUrl);
    if (!res.ok) throw new Error("That photo could not be loaded. Try another one.");
    buffer = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(w, h, { fit: "cover" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } else {
    const generated = await generateImageBackground({
      template: opts.template,
      scene: opts.scene,
      city: opts.city,
      state: opts.state,
      orientation,
      variant: opts.variant,
    });
    if (generated) {
      ai = true;
      buffer = await sharp(generated).resize(w, h, { fit: "cover" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    }
  }

  if (!buffer) {
    const pairs: [string, string][] = [["#1f2937", "#0f172a"], ["#1e3a5f", "#0b1726"], ["#3b2f1e", "#140f08"]];
    const [c1, c2] = pairs[opts.variant % pairs.length];
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
</svg>`;
    buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  }

  const p = `images/${opts.userId}/bg_${Date.now()}_${opts.variant}.jpg`;
  const { error } = await admin.storage.from("assets").upload(p, buffer, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return { url: publicUrl(admin, p), ai };
}

/** Draws the words, logo and headshot over a background and uploads the result. */
export async function renderImage(opts: {
  userId: string;
  shape: ImageShape;
  backgroundUrl: string;
  text: ImageText;
}): Promise<string> {
  const admin = createAdminClient();
  const { w, h, orientation } = IMAGE_SHAPES[opts.shape];
  const landscape = orientation === "landscape";
  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;

  const bgRes = await fetch(opts.backgroundUrl);
  if (!bgRes.ok) throw new Error("The background could not be loaded. Make a new one.");
  const base = await sharp(Buffer.from(await bgRes.arrayBuffer())).resize(w, h, { fit: "cover" }).toBuffer();

  const accent = opts.text.accent && HEX.test(opts.text.accent) ? opts.text.accent : "#f59e0b";
  const kicker = (opts.text.kicker || "").trim().toUpperCase();
  const headline = (opts.text.headline || "").trim();
  const subline = (opts.text.subline || "").trim();

  const M = Math.round(Math.min(w, h) * 0.07);
  const maxW = w - 2 * M;
  const gap = Math.round(M * 0.4);

  const kSize = Math.round(w * (landscape ? 0.02 : 0.034));
  const kPadX = Math.round(kSize * 0.8);
  const kH = Math.round(kSize * 2);

  const hl = headline
    ? fitWrapped(headline, maxW, Math.round(w * (landscape ? 0.062 : 0.1)), Math.round(w * (landscape ? 0.032 : 0.05)), 3)
    : { size: 0, lines: [] as string[] };
  const hlLH = Math.round(hl.size * 1.1);

  const sub = subline
    ? fitWrapped(subline, maxW, Math.round(w * (landscape ? 0.026 : 0.042)), Math.round(w * (landscape ? 0.018 : 0.03)), 2)
    : { size: 0, lines: [] as string[] };
  const subLH = Math.round(sub.size * 1.3);

  const blocks: number[] = [];
  if (kicker) blocks.push(kH);
  if (hl.lines.length) blocks.push(hl.lines.length * hlLH);
  if (sub.lines.length) blocks.push(sub.lines.length * subLH);
  const blockH = blocks.reduce((a, b) => a + b, 0) + gap * Math.max(0, blocks.length - 1);

  let y = h - M - blockH;
  const parts: string[] = [];

  if (kicker) {
    const pillW = Math.round(textWidth(kicker, kSize) + kPadX * 2);
    parts.push(`<rect x="${M}" y="${y}" width="${pillW}" height="${kH}" rx="${Math.round(kH / 2)}" fill="${accent}"/>`);
    parts.push(lineToPaths(kicker, M + kPadX, y + Math.round(kH * 0.68), kSize, inkFor(accent)));
    y += kH + gap;
  }
  if (hl.lines.length) {
    hl.lines.forEach((line, i) => {
      parts.push(lineToPaths(line, M, y + Math.round(hl.size * 0.92) + i * hlLH, hl.size, "#ffffff"));
    });
    y += hl.lines.length * hlLH + gap;
  }
  if (sub.lines.length) {
    sub.lines.forEach((line, i) => {
      parts.push(lineToPaths(line, M, y + Math.round(sub.size * 0.95) + i * subLH, sub.size, "#e5e7eb"));
    });
  }

  // The scrim darkens only as far up as the text reaches, so a photo with no
  // words over most of it keeps its own light.
  const scrimTop = Math.max(0, (h - M - blockH - M * 2) / h);
  const overlay = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="${Math.max(0, scrimTop - 0.15).toFixed(3)}" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${blocks.length ? 0.8 : 0}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#scrim)"/>
  ${parts.join("\n")}
</svg>`;

  const composites: { input: Buffer; left: number; top: number }[] = [
    { input: Buffer.from(overlay), left: 0, top: 0 },
  ];

  const { data: profile } = await admin
    .from("profiles")
    .select("logo_url, avatar_url")
    .eq("id", opts.userId)
    .single();
  const prof = profile as { logo_url: string | null; avatar_url: string | null } | null;

  // Logo, top right, on a light plate so a dark logo survives a dark photo.
  if (opts.text.showLogo && prof?.logo_url) {
    try {
      const res = await fetch(prof.logo_url);
      if (res.ok) {
        const logo = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize({ width: Math.round(w * 0.22), height: Math.round(h * (landscape ? 0.12 : 0.08)), fit: "inside" })
          .png()
          .toBuffer();
        const meta = await sharp(logo).metadata();
        const lw = meta.width || 0, lh = meta.height || 0;
        const pad = Math.round(Math.max(lw, lh) * 0.12) + 8;
        const plateW = lw + pad * 2, plateH = lh + pad * 2;
        const plate = Buffer.from(
          `<svg width="${plateW}" height="${plateH}" xmlns="http://www.w3.org/2000/svg"><rect width="${plateW}" height="${plateH}" rx="${Math.round(pad * 0.9)}" fill="#ffffff" fill-opacity="0.92"/></svg>`,
        );
        composites.push({ input: plate, left: w - M - plateW, top: M });
        composites.push({ input: logo, left: w - M - plateW + pad, top: M + pad });
      }
    } catch { /* the image still renders without the logo */ }
  }

  // Headshot, top left, in a white ring.
  if (opts.text.showHeadshot && prof?.avatar_url) {
    try {
      const res = await fetch(prof.avatar_url);
      if (res.ok) {
        const d = Math.round(Math.min(w, h) * 0.17);
        const ring = Math.max(6, Math.round(d * 0.035));
        const mask = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
        const face = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize(d, d, { fit: "cover", position: "attention" })
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();
        const outer = d + ring * 2;
        const ringSvg = Buffer.from(`<svg width="${outer}" height="${outer}"><circle cx="${outer / 2}" cy="${outer / 2}" r="${outer / 2}" fill="#ffffff"/></svg>`);
        composites.push({ input: ringSvg, left: M, top: M });
        composites.push({ input: face, left: M + ring, top: M + ring });
      }
    } catch { /* the image still renders without the headshot */ }
  }

  const out = await sharp(base).composite(composites).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const p = `images/${opts.userId}/img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await admin.storage.from("assets").upload(p, out, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return publicUrl(admin, p);
}
