import { createAdminClient } from "@/lib/supabase/admin";
import QRCode from "qrcode";
import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import { glyphPathData } from "@/lib/utils/glyph-path-data";
import {
  isHidden, offsetOf, scaleOf, type BannerLayout, type BlockAdjust,
} from "@/lib/utils/banner-layout";
import {
  customPalette, type BannerCustomColors, type BannerPaletteColors,
} from "@/lib/utils/banner-colors";
import {
  emptyScene, sceneToPdf, type BannerScene, type SceneImage, type SceneText,
} from "@/lib/utils/banner-pdf";

// opentype.js is an old UMD package — depending on how the server bundle
// resolves it, its functions land on the namespace itself or on .default.
// (Same defensive resolution as thumbnail-render.ts.)
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

import { YOUTUBE_BANNER } from "@/lib/utils/youtube-banner";

// Only the background extends beyond the centered safe zone.
const { width: W, height: H, safe: SAFE } = YOUTUBE_BANNER;

// Vercel's Linux runtime has no system fonts, so SVG <text> renders as empty
// boxes. We bundle Archivo Black (OFL — a heavy grotesque close to the
// template's bold look) and convert every string to vector <path> outlines
// with opentype.js, so it renders identically on any server. Because the
// output is glyph geometry (not raw text), no XML-escaping of user text is
// needed inside the SVG.
let _font: opentypeNs.Font | null = null;
function getFont(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

function textPathData(text: string, x: number, y: number, fontSize: number): string {
  return glyphPathData(getFont().getPath(text, x, y, fontSize));
}
function textWidth(text: string, fontSize: number): number {
  return getFont().getAdvanceWidth(text, fontSize);
}

/** Largest font size (down to `min`) at which `text` fits `maxWidth`. */
function fitFont(text: string, maxWidth: number, start: number, min = 24): number {
  let f = start;
  while (f > min && textWidth(text, f) > maxWidth) f -= 2;
  return f;
}

/** Greedy word-wrap into lines no wider than `maxWidth` at `fontSize`. */
function wrapLines(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(t, fontSize) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Render a single line as one filled path PER WORD, laid left→right from
 * `startX`. Splitting per word is deliberate: librsvg (sharp's SVG renderer)
 * silently truncates a path whose `d` attribute grows past ~5k chars, which a
 * long single-path line (e.g. a full contact line) would exceed — one path per
 * word keeps every `d` well under that limit. Positioning uses advance widths,
 * matching opentype's own (kerning-free) layout, so there's no visual drift.
 */
function lineToPaths(line: string, startX: number, y: number, fontSize: number, fill: string): string {
  const space = textWidth(" ", fontSize);
  let cx = startX;
  const out: string[] = [];
  for (const word of line.split(" ")) {
    if (word) out.push(`<path d="${textPathData(word, cx, y, fontSize)}" fill="${fill}"/>`);
    cx += textWidth(word, fontSize) + space;
  }
  return out.join("");
}

// ── Color palettes ───────────────────────────────────────────────────────────
// Each is a light left→right gradient with dark, readable text (the template's
// aesthetic), so the design holds up whichever the user picks.
type Palette = BannerPaletteColors;

export const BANNER_PALETTES: Record<string, Palette> = {
  ocean:    { gradLeft: "#c9f2d4", gradRight: "#9fb8ef", navy: "#1e3a8a", royal: "#1d4ed8", qrDark: "#1a4ba8" },
  sunset:   { gradLeft: "#ffe0c2", gradRight: "#f9c0d9", navy: "#7c2d12", royal: "#be185d", qrDark: "#9d174d" },
  forest:   { gradLeft: "#d1f5d3", gradRight: "#9fe3d0", navy: "#14532d", royal: "#047857", qrDark: "#0f766e" },
  lavender: { gradLeft: "#e9d5ff", gradRight: "#bfdbfe", navy: "#5b21b6", royal: "#6d28d9", qrDark: "#6d28d9" },
  coral:    { gradLeft: "#fef3c7", gradRight: "#fecaca", navy: "#881337", royal: "#be123c", qrDark: "#be123c" },
  slate:    { gradLeft: "#e2e8f0", gradRight: "#c7d2e0", navy: "#1e293b", royal: "#2563eb", qrDark: "#334155" },
};
const DEFAULT_PALETTE = "ocean";

/**
 * The palette to draw with: the agent's own colors when palette is "custom"
 * and they are valid, otherwise the named preset, otherwise the default.
 */
export function resolvePalette(opts: { palette?: string; customColors?: Partial<BannerCustomColors> | null }): Palette {
  if (opts.palette === "custom") {
    const custom = customPalette(opts.customColors);
    if (custom) return custom;
  }
  return BANNER_PALETTES[opts.palette ?? DEFAULT_PALETTE] ?? BANNER_PALETTES[DEFAULT_PALETTE];
}

export interface RenderBannerOptions {
  userId: string;
  headline?: string;
  qr1Caption?: string;
  qr1Link?: string;
  subscribeKicker?: string;
  subscribeMain?: string;
  subscribeSub?: string;
  /** Two optional lines rendered below the "below SUBSCRIBE" line. */
  extraLine1?: string;
  extraLine2?: string;
  qr2Caption?: string;
  qr2Link?: string;
  /** 0–2 photo URLs; laid out into the left photo slot(s). */
  photoUrls?: string[];
  /** Optional logo, fitted whole with its transparency preserved. */
  logoUrl?: string;
  /** Color palette key (see BANNER_PALETTES) or "custom"; defaults to "ocean". */
  palette?: string;
  /** The agent's own colors, used when palette is "custom". */
  customColors?: Partial<BannerCustomColors> | null;
  /**
   * Per-block alignment, vertical nudge, size and visibility. Each piece is
   * fitted into its own slot inside the safe zone, including saved layouts.
   */
  layout?: BannerLayout;
}

const DEFAULTS = {
  headline: "WATCHING ON TV?",
  qr1Caption: "SCAN TO CHAT WITH US!",
  subscribeKicker: "NEW VIDEOS EVERY WEEK!",
  subscribeMain: "SUBSCRIBE",
  subscribeSub: "TO LEARN ALL ABOUT",
  qr2Caption: "CALL, TEXT OR MEET US ON ZOOM!!",
};

/** Generate a QR PNG buffer sized to `size` px, tinted `dark`. */
async function makeQr(link: string, size: number, dark: string): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(link.trim(), {
      type: "png",
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark, light: "#ffffff" },
    });
  } catch (err) {
    console.error("[banner-render] QR generation failed:", err);
    return null;
  }
}

/**
 * Fetch a photo and fit it (cover) into a rounded-corner box of bw×bh.
 * Returns null on any failure so the banner still renders without it.
 */
async function roundedPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: any, url: string, bw: number, bh: number, radius = 24, fit: "cover" | "contain" = "cover",
): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const src = Buffer.from(await res.arrayBuffer());
    // .rotate() applies the EXIF orientation a phone photo carries, which
    // sharp otherwise ignores — without it a portrait shot is cropped sideways.
    const filled = await sharp(src).rotate().resize(bw, bh, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const mask = Buffer.from(
      `<svg width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    );
    return await sharp(filled).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * A reusable YouTube template: background fills 2560×1440, while every live
 * text/image element is fitted into a slot within the central 1546×423 area.
 * PNG and Canva PDF consume the very same fitted scene coordinates.
 */
export async function renderBanner(opts: RenderBannerOptions): Promise<{ png: Buffer; scene: BannerScene }> {
  const pal = resolvePalette(opts);
  const L = opts.layout ?? {};
  const value = (key: keyof typeof DEFAULTS) => (opts[key] ?? DEFAULTS[key]).trim();
  const headline = value("headline") || DEFAULTS.headline;
  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg"><stop stop-color="${pal.gradLeft}"/>
    <stop offset="100%" stop-color="${pal.gradRight}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/></svg>`;
  const baseBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const scene = emptyScene(W, H, pal.gradLeft, pal.gradRight, baseBuffer);
  type Group = { texts: SceneText[]; images: SceneImage[] };
  type Slot = { x: number; y: number; w: number; h: number };
  const group = (): Group => ({ texts: [], images: [] });
  const addText = (g: Group, lines: string[], y: number, size: number, color: string) => {
    lines.forEach((text, i) => {
      if (text) g.texts.push({ text, x: 0, baseline: y + i * size * 1.14, size, color });
    });
  };
  // Measure glyph ink, including descenders/overhangs, rather than just the
  // nominal font size. Position controls are clamped to each reserved slot,
  // so large sizes and extreme saved/API nudges cannot escape or overlap it.
  const place = (g: Group, slot: Slot, adjust?: BlockAdjust) => {
    if (isHidden(adjust) || (!g.texts.length && !g.images.length)) return;
    const boxes = [
      ...g.texts.map(t => {
        const b = getFont().getPath(t.text, t.x, t.baseline, t.size).getBoundingBox();
        return { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 };
      }),
      ...g.images.map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h })),
    ];
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    const w = Math.max(...boxes.map(b => b.x + b.w)) - x;
    const h = Math.max(...boxes.map(b => b.y + b.h)) - y;
    if (w <= 0 || h <= 0) return;
    const fit = Math.min(slot.w / w, slot.h / h);
    const scale = Math.min(fit, Math.min(1, fit) * scaleOf(adjust));
    const dx = adjust?.align === "right" ? slot.w - w * scale
      : adjust?.align === "center" ? (slot.w - w * scale) / 2 : 0;
    const dy = Math.max(0, Math.min(slot.h - h * scale,
      (slot.h - h * scale) / 2 + offsetOf(adjust)));
    const tx = slot.x + dx - x * scale, ty = slot.y + dy - y * scale;
    scene.texts.push(...g.texts.map(t => ({ ...t, x: tx + t.x * scale,
      baseline: ty + t.baseline * scale, size: t.size * scale })));
    scene.images.push(...g.images.map(i => ({ ...i, x: tx + i.x * scale,
      y: ty + i.y * scale, w: i.w * scale, h: i.h * scale })));
  };

  const inset = 24, gap = 24;
  const left = SAFE.x + inset, right = SAFE.x + SAFE.width - inset;
  const top = SAFE.y + inset, bottom = SAFE.y + SAFE.height - inset;
  const head = group();
  addText(head, [headline.toUpperCase()], 58, fitFont(headline.toUpperCase(), right - left, 58, 24), pal.navy);
  place(head, { x: left, y: top, w: right - left, h: 72 }, L.headline);
  const bodyY = top + 96, bodyH = bottom - bodyY;
  const photos = (opts.photoUrls ?? []).filter(u => typeof u === "string" && u.trim()).slice(0, 2);
  const showPhotos = photos.length > 0 && !isHidden(L.photos);
  const showLogo = !!opts.logoUrl?.trim() && !isHidden(L.logo);
  const mediaW = showPhotos || showLogo ? 300 : 0;
  const media = group();
  const photoW = photos.length === 2 ? 142 : 230;
  const photoH = showLogo ? 180 : 245;
  if (showPhotos) {
    for (let i = 0; i < photos.length; i++) {
      const url = photos[i];
      const png = await roundedPhoto(sharp, url, photoW, photoH, 16);
      if (png) media.images.push({ png, x: i * (photoW + 16), y: 0, w: photoW, h: photoH });
    }
    place(media, { x: left, y: bodyY, w: mediaW, h: showLogo ? 190 : bodyH }, L.photos);
  }
  if (showLogo) {
    const png = await roundedPhoto(sharp, opts.logoUrl!, 300, 65, 0, "contain");
    if (png) {
      const logo = group();
      logo.images.push({ png, x: 0, y: 0, w: 300, h: 65 });
      place(logo, { x: left, y: showPhotos ? bottom - 65 : bodyY,
        w: mediaW, h: showPhotos ? 65 : bodyH }, L.logo);
    }
  }

  const qrBlocks = (["qr1", "qr2"] as const).filter(key => !!opts[`${key}Link`]?.trim() && !isHidden(L[key]));
  const qrSlotW = 200;
  const qrWidth = qrBlocks.length * qrSlotW + Math.max(0, qrBlocks.length - 1) * gap;
  for (let i = 0; i < qrBlocks.length; i++) {
    const key = qrBlocks[i];
    const png = await makeQr(opts[`${key}Link`]!, 180, pal.qrDark);
    if (!png) continue;
    const qr = group();
    qr.images.push({ png, x: 0, y: 0, w: 180, h: 180 });
    const caption = value(`${key}Caption`).toUpperCase();
    addText(qr, wrapLines(caption, 20, 180), 210, 20, pal.navy);
    place(qr, { x: right - qrWidth + i * (qrSlotW + gap), y: bodyY,
      w: qrSlotW, h: bodyH }, L[key]);
  }

  const textX = left + (mediaW ? mediaW + gap : 0);
  const textRight = right - (qrWidth ? qrWidth + gap : 0);
  const textW = textRight - textX;
  const sub = group();
  let baseline = 0;
  for (const [text, size, color] of [
    [value("subscribeKicker"), 28, pal.navy],
    [value("subscribeMain"), 72, pal.royal],
    [value("subscribeSub"), 28, pal.navy],
    [(opts.extraLine1 ?? "").trim(), 24, pal.navy],
    [(opts.extraLine2 ?? "").trim(), 24, pal.navy],
  ] as const) {
    if (!text) continue;
    const fitted = fitFont(text.toUpperCase(), textW, size, Math.min(20, size));
    const lines = wrapLines(text.toUpperCase(), fitted, textW);
    baseline += fitted;
    addText(sub, lines, baseline, fitted, color);
    baseline += (lines.length - 1) * fitted * 1.14 + 12;
  }
  place(sub, { x: textX, y: bodyY, w: textW, h: bodyH }, L.subscribe);

  const parts = scene.texts.map(t => lineToPaths(t.text, t.x, t.baseline, t.size, t.color));
  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
  const composites = await Promise.all(scene.images.map(async i => {
    // Record the rounded raster geometry back into the shared scene, so the
    // PDF uses exactly the same dimensions and positions as the PNG.
    i.x = Math.round(i.x); i.y = Math.round(i.y);
    i.w = Math.max(1, Math.round(i.w)); i.h = Math.max(1, Math.round(i.h));
    i.png = await sharp(i.png).resize(i.w, i.h).png().toBuffer();
    return { input: i.png, left: i.x, top: i.y };
  }));
  const png = await sharp(baseBuffer)
    .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }, ...composites])
    .png({ compressionLevel: 6 }).toBuffer();
  return { png, scene };
}

/**
 * Renders, uploads the PNG and its Canva PDF to the public `assets` bucket,
 * and returns both URLs. The PDF is the extra: if it fails, the banner still
 * returns without one rather than failing the whole generate.
 */
export async function renderAndSaveBanner(opts: RenderBannerOptions): Promise<{ url: string; pdfUrl?: string }> {
  const { png, scene } = await renderBanner(opts);
  const admin = createAdminClient();

  const base = `banners/${opts.userId}/banner_${Date.now()}`;
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
    console.error("[banner] Canva PDF failed:", e instanceof Error ? e.message : e);
  }
  return { url: publicUrl, pdfUrl };
}
