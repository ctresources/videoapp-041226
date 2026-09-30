import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePalette, type RenderBannerOptions } from "@/lib/utils/banner-render";
import QRCode from "qrcode";
import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import { glyphPathData } from "@/lib/utils/glyph-path-data";
import {
  emptyScene, sceneToPdf, type BannerScene, type SceneImage, type SceneText,
} from "@/lib/utils/banner-pdf";

// Facebook covers and LinkedIn banners. This is a separate renderer from the
// YouTube one on purpose: banner-render.ts is positioned by hand to match a
// design the owner supplied, while these two are a different shape (wide and
// short) with a different job. They take the same inputs and palettes, so the
// Banners tab stays one form for all three — only the canvas changes.

// Same defensive resolution as banner-render.ts / thumbnail-render.ts.
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

export type SocialPlatform = "facebook" | "linkedin";

export function isSocialPlatform(p: unknown): p is SocialPlatform {
  return p === "facebook" || p === "linkedin";
}

interface Layout {
  W: number;
  H: number;
  /** Everything that matters stays inside this box. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /**
   * The right edge of what a phone shows, where it is narrower than the box
   * (LinkedIn). A photo placed right of the text stops here, so phones still
   * show it, and the QR codes take the desktop-only strip beyond.
   */
  phoneX1?: number;
  /** The text column never extends past this x, even with nothing to its right. */
  textMaxX: number;
  /** Starting text sizes; the stack shrinks from these until it fits the box. */
  sizes: { headline: number; kicker: number; main: number; sub: number; extra: number; qrCaption: number };
  qrMax: number;
  /** Two QR codes side by side (short canvas) or stacked (taller canvas). */
  qrStack: "row" | "column";
  photo: { one: { w: number; h: number }; two: { w: number; h: number }; gap: number; radius: number };
  /**
   * Photo sizes and photo-to-text space when the photo sits right of the
   * text. Only LinkedIn has one: there the QR codes move out to the
   * desktop-only strip, which frees the width for a bigger photo and more
   * air. On the left, with both QR codes full size, the same photo would
   * squeeze the text into a column too narrow for the main word.
   */
  photoRight?: { one: { w: number; h: number }; two: { w: number; h: number }; textGap: number };
  /** Space between the photo cluster, the text column and the QR cluster. */
  gap: number;
}

const LAYOUTS: Record<SocialPlatform, Layout> = {
  // LinkedIn personal banner, 1584×396. A phone shows only the centre ~60% of
  // the width (x 317–1267), and on desktop the profile photo covers the
  // bottom-left (roughly x 50–350) — so the box starts clear of it, and the
  // text column is held inside the phone's view. QR codes sit at the right,
  // where only desktop shows them; that's also the only place they can be
  // scanned from.
  linkedin: {
    W: 1584, H: 396,
    box: { x0: 420, y0: 36, x1: 1552, y1: 360 },
    phoneX1: 1267,
    textMaxX: 1250,
    sizes: { headline: 54, kicker: 26, main: 84, sub: 30, extra: 24, qrCaption: 20 },
    qrMax: 170,
    qrStack: "row",
    photo: { one: { w: 200, h: 270 }, two: { w: 140, h: 230 }, gap: 16, radius: 18 },
    // One photo fills the box's full height (324 = 360 - 36).
    photoRight: { one: { w: 240, h: 324 }, two: { w: 160, h: 300 }, textGap: 64 },
    gap: 40,
  },
  // Facebook cover, uploaded at 2× (1640×720) for sharpness. Desktop trims
  // the top and bottom (820×312 shown of 820×360), phones trim the sides
  // (640×360), so only the centre 1280×624 survives both. The box sits inside
  // that with a margin.
  facebook: {
    W: 1640, H: 720,
    box: { x0: 220, y0: 90, x1: 1420, y1: 630 },
    textMaxX: 1420,
    sizes: { headline: 78, kicker: 36, main: 120, sub: 42, extra: 32, qrCaption: 24 },
    qrMax: 210,
    qrStack: "column",
    photo: { one: { w: 300, h: 400 }, two: { w: 200, h: 320 }, gap: 20, radius: 24 },
    gap: 48,
  },
};

// Keep in sync with BANNER_PLATFORM_DEFAULTS in app/(dashboard)/tools/page.tsx.
const DEFAULTS: Record<SocialPlatform, {
  headline: string; qr1Caption: string; subscribeKicker: string;
  subscribeMain: string; subscribeSub: string; qr2Caption: string;
}> = {
  // Each platform's own words. These started as the YouTube banner's with
  // only the headline and main word swapped, which left "NEW VIDEOS EVERY
  // WEEK! / CONNECT / TO LEARN ALL ABOUT" on a LinkedIn profile: a subscribe
  // banner at LinkedIn's size.
  facebook: {
    headline: "YOUR LOCAL REAL ESTATE GUIDE",
    qr1Caption: "SCAN TO WATCH MY VIDEOS",
    subscribeKicker: "HOMES · TOWNS · MARKET UPDATES",
    subscribeMain: "FOLLOW",
    subscribeSub: "FOR THE LOCAL INSIDE SCOOP",
    qr2Caption: "SCAN TO BOOK A CALL",
  },
  linkedin: {
    headline: "YOUR LOCAL REAL ESTATE GUIDE",
    qr1Caption: "SCAN TO WATCH MY VIDEOS",
    subscribeKicker: "MOVING IN OR MOVING ON?",
    subscribeMain: "LET'S TALK",
    subscribeSub: "BUYERS · SELLERS · RELOCATION",
    qr2Caption: "SCAN TO BOOK A CALL",
  },
};

const LINE_H = 1.14;
/**
 * Baseline to baseline for a wrapped line in the main text stack. Looser than
 * LINE_H (still used for QR captions, where every pixel of height is QR size):
 * a stack of bold capitals at 1.14 read as one block of ink.
 */
const TEXT_LINE_H = 1.25;
/** Space between separate lines of the stack, as a share of the larger size. */
const STACK_GAP = 0.5;

// ── Text as vector outlines ─────────────────────────────────────────────────
// Same approach as banner-render.ts (see there for the full reasoning): the
// server has no system fonts, so every string becomes glyph paths, one path
// per word to stay under librsvg's path-length limit.
let _font: opentypeNs.Font | null = null;
function getFont(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

function textWidth(text: string, fontSize: number): number {
  return getFont().getAdvanceWidth(text, fontSize);
}

/** Height from baseline to the top of a capital — how tall an uppercase line really is. */
function capHeight(fontSize: number): number {
  const f = getFont();
  const os2 = (f.tables as unknown as Record<string, { sCapHeight?: number } | undefined>).os2;
  return fontSize * ((os2?.sCapHeight ?? 0.72 * f.unitsPerEm) / f.unitsPerEm);
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

/** Largest size (down to `min`) at which `text` wraps into `maxLines` lines that all fit. */
function fitWrapped(text: string, maxWidth: number, start: number, min: number, maxLines: number) {
  let size = start;
  for (;;) {
    const lines = wrapLines(text, size, maxWidth);
    const fits = lines.length <= maxLines && lines.every((l) => textWidth(l, size) <= maxWidth);
    if (fits || size <= min) return { size, lines };
    size -= 2;
  }
}

function lineToPaths(line: string, startX: number, y: number, fontSize: number, fill: string): string {
  const space = textWidth(" ", fontSize);
  let cx = startX;
  const out: string[] = [];
  for (const word of line.split(" ")) {
    if (word) out.push(`<path d="${glyphPathData(getFont().getPath(word, cx, y, fontSize))}" fill="${fill}"/>`);
    cx += textWidth(word, fontSize) + space;
  }
  return out.join("");
}

/** Lines centred on `cx`; `y` is the first line's baseline. */
function centeredBlock(lines: string[], cx: number, y: number, fontSize: number, fill: string, lineH = LINE_H): string {
  return lines
    .map((l, i) => lineToPaths(l, cx - textWidth(l, fontSize) / 2, y + i * fontSize * lineH, fontSize, fill))
    .join("\n");
}

// ── Raster inputs ────────────────────────────────────────────────────────────

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
    console.error("[social-banner-render] QR generation failed:", err);
    return null;
  }
}

/** Fetch a photo and confirm it decodes. Null on any failure. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchImage(sharp: any, url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).metadata();
    return buf;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function roundedPhoto(sharp: any, src: Buffer, bw: number, bh: number, radius: number): Promise<Buffer | null> {
  try {
    // See banner-render: EXIF orientation, applied before the crop.
    const filled = await sharp(src).rotate().resize(bw, bh, { fit: "cover" }).png().toBuffer();
    const mask = Buffer.from(
      `<svg width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    );
    return await sharp(filled).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  } catch {
    return null;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

export interface RenderSocialBannerOptions extends RenderBannerOptions {
  platform: SocialPlatform;
  /**
   * Which side of the text the photos sit. "right" puts them between the text
   * and the QR codes, clear of the LinkedIn profile photo that covers the
   * banner's bottom-left. Absent means "left", the original arrangement.
   */
  photoSide?: "left" | "right";
}

/**
 * Lays out, left to right: 0–2 photos, a centred text stack (headline, then
 * the kicker / main word / sub / extra lines), and 0–2 QR codes with their
 * captions. Nothing is at a fixed position — each part takes the width the
 * others leave, and the text shrinks until the stack fits the box, so any mix
 * of optional inputs still lands inside the area every device shows.
 */
export async function renderSocialBanner(
  opts: RenderSocialBannerOptions,
): Promise<{ png: Buffer; width: number; height: number; scene: BannerScene }> {
  const L = LAYOUTS[opts.platform];
  const D = DEFAULTS[opts.platform];
  const { W, H, box } = L;
  const midY = (box.y0 + box.y1) / 2;
  const boxH = box.y1 - box.y0;

  const pick = (v: string | undefined, d: string) => (v ?? d).trim();
  const headline = pick(opts.headline, D.headline) || D.headline;
  const kicker = pick(opts.subscribeKicker, D.subscribeKicker);
  const main = pick(opts.subscribeMain, D.subscribeMain);
  const sub = pick(opts.subscribeSub, D.subscribeSub);
  const extra1 = (opts.extraLine1 ?? "").trim();
  const extra2 = (opts.extraLine2 ?? "").trim();
  const qr1Link = opts.qr1Link?.trim() || "";
  const qr2Link = opts.qr2Link?.trim() || "";
  const photoUrls = (opts.photoUrls || []).filter((u) => typeof u === "string" && u.trim()).slice(0, 2);
  const pal = resolvePalette(opts);

  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;

  // Photos are fetched before layout: the layout depends on how many actually
  // loaded, so a dead link leaves no empty gap.
  const photoSrcs = (await Promise.all(photoUrls.map((u) => fetchImage(sharp, u)))).filter((b): b is Buffer => !!b);
  const photoRight = opts.photoSide === "right" && photoSrcs.length > 0;
  const sizes = photoRight && L.photoRight ? L.photoRight : L.photo;
  const photoSize = photoSrcs.length === 2 ? sizes.two : sizes.one;
  const photoTextGap = photoRight && L.photoRight ? L.photoRight.textGap : L.gap;
  const photoW = photoSrcs.length ? photoSrcs.length * photoSize.w + (photoSrcs.length - 1) * L.photo.gap : 0;

  // QR groups — a caption is drawn only alongside a QR, as on the YouTube banner.
  const capSize = L.sizes.qrCaption;
  const CAP_GAP = 14;
  const QR_GAP = L.qrStack === "row" ? 24 : 30;
  // Photo right of the text on a canvas with a phone edge: the photo ends at
  // that edge and the QR codes get only the strip beyond it, so they narrow to
  // fit rather than push the photo back inside.
  // That strip runs to the canvas edge less a hairline rather than to the
  // box, because every pixel of width there is QR size, and it is desktop-only
  // anyway: nothing can crop it.
  const qrStripX0 = photoRight && L.phoneX1 && L.qrStack === "row" ? L.phoneX1 + 12 : null;
  const qrRight = qrStripX0 !== null ? W - 16 : box.x1;
  const qrCount = [qr1Link, qr2Link].filter(Boolean).length;
  let capW = L.qrStack === "row" ? L.qrMax + 20 : L.qrMax + 90;
  if (qrStripX0 !== null && qrCount) {
    capW = Math.min(capW, Math.floor((qrRight - qrStripX0 - (qrCount - 1) * QR_GAP) / qrCount));
  }
  const groups = [
    { link: qr1Link, caption: pick(opts.qr1Caption, D.qr1Caption) },
    { link: qr2Link, caption: pick(opts.qr2Caption, D.qr2Caption) },
  ]
    .filter((q) => q.link)
    .map((q) => {
      const lines = q.caption ? wrapLines(q.caption.toUpperCase(), capSize, capW) : [];
      const capH = lines.length ? capHeight(capSize) + (lines.length - 1) * capSize * LINE_H : 0;
      return { ...q, lines, capH, above: lines.length ? capH + CAP_GAP : 0 };
    });

  let qrSize = L.qrMax;
  if (groups.length && L.qrStack === "row") {
    qrSize = Math.min(L.qrMax, boxH - Math.max(...groups.map((g) => g.above)));
  } else if (groups.length) {
    const fixed = groups.reduce((s, g) => s + g.above, 0) + (groups.length - 1) * QR_GAP;
    qrSize = Math.min(L.qrMax, (boxH - fixed) / groups.length);
  }
  // A QR never wider than its column, which only binds once the strip above narrows it.
  if (L.qrStack === "row") qrSize = Math.min(qrSize, capW - 20);
  qrSize = Math.floor(qrSize);
  const qrW = !groups.length ? 0 : L.qrStack === "row" ? groups.length * capW + (groups.length - 1) * QR_GAP : capW;

  // Photos on the right end at the phone edge, or just short of the QR codes
  // when those come first; on the left they start the box, as they always did.
  const qrX0 = qrRight - qrW;
  const photoX1 = !photoRight ? box.x0 + photoW
    : qrStripX0 !== null ? L.phoneX1!
    : qrW ? qrX0 - L.gap : box.x1;
  const photoX0 = photoX1 - photoW;

  // Text column: whatever the photos and QR codes leave.
  const colX0 = photoW && !photoRight ? photoX1 + photoTextGap : box.x0;
  const colX1 = Math.min(
    photoRight ? photoX0 - photoTextGap : box.x1 - (qrW ? qrW + L.gap : 0),
    L.textMaxX,
  );
  const colW = colX1 - colX0;
  const colCx = (colX0 + colX1) / 2;

  const S = L.sizes;
  const items: { text: string; size: number; min: number; maxLines: number; fill: string; after?: number; before?: number; accent?: boolean }[] = [
    // `after` opens extra space below the headline so it reads as its own group.
    { text: headline, size: S.headline, min: 22, maxLines: 2, fill: pal.navy, after: 0.35 },
  ];
  if (kicker) items.push({ text: kicker, size: S.kicker, min: 14, maxLines: 2, fill: pal.navy });
  if (main) items.push({ text: main, size: S.main, min: 28, maxLines: 1, fill: pal.royal, accent: true });
  if (sub) items.push({ text: sub, size: S.sub, min: 14, maxLines: 2, fill: pal.navy });
  // `before` on the first extra line breaks the name and contact details away
  // from the message above, so they read as a sign-off rather than more message.
  [extra1, extra2].filter(Boolean).forEach((extra, i) => {
    items.push({ text: extra, size: S.extra, min: 12, maxLines: 1, fill: pal.navy, before: i === 0 && items.length > 1 ? 0.9 : 0 });
  });

  const gapBetween = (prev: { size: number; after: number }, cur: { size: number; before: number }) =>
    STACK_GAP * Math.max(prev.size, cur.size) + prev.after * prev.size + cur.before * cur.size;

  // Fit each line to the column, then shrink the whole stack until it fits the box.
  let scale = 1;
  let laid: { lines: string[]; size: number; fill: string; after: number; before: number }[] = [];
  let total = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    laid = [];
    for (const it of items) {
      // Nothing but the main word outranks the headline. A short supporting
      // line fits a narrow column at a bigger size than a long headline does,
      // and would otherwise come out larger than it.
      let start = Math.max(it.min, Math.round(it.size * scale));
      if (laid.length && !it.accent) start = Math.max(it.min, Math.min(start, laid[0].size));
      const { size, lines } = fitWrapped(it.text.toUpperCase(), colW, start, it.min, it.maxLines);
      // A list like "BUYERS · SELLERS · RELOCATION" can wrap at a separator;
      // the dot left hanging at a line's end (or start) goes.
      const clean = lines.map((l) => l.replace(/\s*·\s*$/, "").replace(/^\s*·\s*/, ""));
      laid.push({ lines: clean, size, fill: it.fill, after: it.after ?? 0, before: it.before ?? 0 });
    }
    total = laid.reduce(
      (s, it, i) => s + capHeight(it.size) + (it.lines.length - 1) * it.size * TEXT_LINE_H + (i ? gapBetween(laid[i - 1], it) : 0),
      0,
    );
    if (total <= boxH) break;
    scale *= 0.9;
  }

  const parts: string[] = [];
  // Everything drawn, recorded as live parts for the Canva PDF (banner-pdf.ts).
  const texts: SceneText[] = [];
  const images: SceneImage[] = [];
  const drawCentered = (lines: string[], cx: number, y: number, size: number, fill: string, lineH = LINE_H) => {
    lines.forEach((l, i) => texts.push({ text: l, x: cx - textWidth(l, size) / 2, baseline: y + i * size * lineH, size, color: fill }));
    return centeredBlock(lines, cx, y, size, fill, lineH);
  };
  let y = midY - total / 2;
  laid.forEach((it, i) => {
    if (i) y += gapBetween(laid[i - 1], it);
    const baseline = y + capHeight(it.size);
    parts.push(drawCentered(it.lines, colCx, baseline, it.size, it.fill, TEXT_LINE_H));
    y = baseline + (it.lines.length - 1) * it.size * TEXT_LINE_H;
  });

  const composites: { input: Buffer; left: number; top: number }[] = [];

  const photoTop = Math.round(midY - photoSize.h / 2);
  for (let i = 0; i < photoSrcs.length; i++) {
    const buf = await roundedPhoto(sharp, photoSrcs[i], photoSize.w, photoSize.h, L.photo.radius);
    if (!buf) continue;
    const left = Math.round(photoX0 + i * (photoSize.w + L.photo.gap));
    composites.push({ input: buf, left, top: photoTop });
    images.push({ png: buf, x: left, y: photoTop, w: photoSize.w, h: photoSize.h });
  }

  // Caption sits directly above its QR, centred on it.
  const placeQr = async (g: (typeof groups)[number], cx: number, qrTop: number) => {
    const q = await makeQr(g.link, qrSize, pal.qrDark);
    if (q) {
      composites.push({ input: q, left: Math.round(cx - qrSize / 2), top: qrTop });
      images.push({ png: q, x: Math.round(cx - qrSize / 2), y: qrTop, w: qrSize, h: qrSize });
    }
    if (g.lines.length) {
      const firstBaseline = qrTop - CAP_GAP - (g.lines.length - 1) * capSize * LINE_H;
      parts.push(drawCentered(g.lines, cx, firstBaseline, capSize, pal.navy));
    }
  };
  if (L.qrStack === "row") {
    // QR codes share one top edge; captions of different lengths grow upward.
    const above = Math.max(0, ...groups.map((g) => g.above));
    const qrTop = Math.round(midY - (above + qrSize) / 2 + above);
    for (let i = 0; i < groups.length; i++) {
      await placeQr(groups[i], qrX0 + i * (capW + QR_GAP) + capW / 2, qrTop);
    }
  } else {
    const heights = groups.map((g) => g.above + qrSize);
    let gy = midY - (heights.reduce((a, b) => a + b, 0) + (groups.length - 1) * QR_GAP) / 2;
    for (let i = 0; i < groups.length; i++) {
      await placeQr(groups[i], qrX0 + capW / 2, Math.round(gy + groups[i].above));
      gy += heights[i] + QR_GAP;
    }
  }

  const bgSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.gradLeft}"/>
      <stop offset="100%" stop-color="${pal.gradRight}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`;
  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;

  const png = await sharp(Buffer.from(bgSvg))
    .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }, ...composites])
    .png({ compressionLevel: 6 })
    .toBuffer();

  const bgPng = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const scene = { ...emptyScene(W, H, pal.gradLeft, pal.gradRight, bgPng), texts, images };

  return { png, width: W, height: H, scene };
}

/**
 * Renders, uploads the PNG and its Canva PDF to the public `assets` bucket,
 * and returns both URLs. The PDF is the extra: if it fails, the banner still
 * returns without one rather than failing the whole generate.
 */
export async function renderAndSaveSocialBanner(opts: RenderSocialBannerOptions): Promise<{ url: string; pdfUrl?: string }> {
  const { png, scene } = await renderSocialBanner(opts);
  const admin = createAdminClient();

  const base = `banners/${opts.userId}/${opts.platform}_${Date.now()}`;
  const { error: uploadErr } = await admin.storage
    .from("assets")
    .upload(`${base}.png`, png, { contentType: "image/png", upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);
  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(`${base}.png`);

  let pdfUrl: string | undefined;
  try {
    const pdf = await sceneToPdf(scene, `${opts.platform === "linkedin" ? "LinkedIn" : "Facebook"} banner`);
    const { error } = await admin.storage
      .from("assets")
      .upload(`${base}.pdf`, pdf, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
    pdfUrl = admin.storage.from("assets").getPublicUrl(`${base}.pdf`).data.publicUrl;
  } catch (e) {
    console.error("[social-banner] Canva PDF failed:", e instanceof Error ? e.message : e);
  }
  return { url: publicUrl, pdfUrl };
}
