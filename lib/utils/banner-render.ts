import { createAdminClient } from "@/lib/supabase/admin";
import QRCode from "qrcode";
import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";

// opentype.js is an old UMD package — depending on how the server bundle
// resolves it, its functions land on the namespace itself or on .default.
// (Same defensive resolution as thumbnail-render.ts.)
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

// Full YouTube channel-art canvas. The center 1546×423 is the only region
// guaranteed to show on every device (phone/TV); everything else is
// desktop/TV-only. This template deliberately spreads content wider than the
// safe zone (matching the owner's supplied design).
const W = 2560;
const H = 1440;

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
  return getFont().getPath(text, x, y, fontSize).toPathData(2);
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
 * Render a block of (already-wrapped) lines as filled vector paths.
 * `y` is the baseline of the first line. align left/center relative to `x`.
 */
function textBlock(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  { lineHeight = 1.14, align = "left" as "left" | "center" } = {},
): string {
  const lh = fontSize * lineHeight;
  return lines
    .map((l, i) => {
      const lx = align === "center" ? x - textWidth(l, fontSize) / 2 : x;
      return `<path d="${textPathData(l, lx, y + i * lh, fontSize)}" fill="${fill}"/>`;
    })
    .join("\n");
}

/**
 * A hand-drawn-style curved arrow: a quadratic bezier from (x1,y1) through
 * control (cx,cy) to the tip (x2,y2), capped with a filled triangular head
 * oriented along the incoming tangent.
 */
function curvedArrow(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number,
  color = "#111827", width = 12,
): string {
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const ah = 40; // arrowhead length
  const aw = 20; // arrowhead half-width
  const bx1 = x2 - ah * Math.cos(ang) + aw * Math.sin(ang);
  const by1 = y2 - ah * Math.sin(ang) - aw * Math.cos(ang);
  const bx2 = x2 - ah * Math.cos(ang) - aw * Math.sin(ang);
  const by2 = y2 - ah * Math.sin(ang) + aw * Math.cos(ang);
  return `<path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>
<path d="M ${x2} ${y2} L ${bx1.toFixed(1)} ${by1.toFixed(1)} L ${bx2.toFixed(1)} ${by2.toFixed(1)} Z" fill="${color}"/>`;
}

// ── Colors (template-matched) ────────────────────────────────────────────────
const NAVY = "#1e3a8a";       // headline / captions
const ROYAL = "#1d4ed8";      // SUBSCRIBE main word
const QR_DARK = "#1a4ba8";    // blue-tinted QR modules, like the template
const GRAD_LEFT = "#c9f2d4";  // mint
const GRAD_RIGHT = "#9fb8ef"; // periwinkle

export interface RenderBannerOptions {
  userId: string;
  headline?: string;
  qr1Caption?: string;
  qr1Link?: string;
  subscribeKicker?: string;
  subscribeMain?: string;
  subscribeSub?: string;
  qr2Caption?: string;
  qr2Link?: string;
  /** 0–2 photo URLs; laid out into the left photo slot(s). */
  photoUrls?: string[];
}

const DEFAULTS = {
  headline: "WATCHING ON TV?",
  qr1Caption: "SCAN TO CHAT WITH US!",
  subscribeKicker: "NEW VIDEOS EVERY WEEK!",
  subscribeMain: "SUBSCRIBE",
  subscribeSub: "TO LEARN ALL ABOUT",
  qr2Caption: "CALL, TEXT OR MEET US ON ZOOM!!",
};

/** Generate a blue-tinted QR PNG buffer sized to `size` px. */
async function makeQr(link: string, size: number): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(link.trim(), {
      type: "png",
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: QR_DARK, light: "#ffffff" },
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
  sharp: any, url: string, bw: number, bh: number, radius = 24,
): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const src = Buffer.from(await res.arrayBuffer());
    const filled = await sharp(src).resize(bw, bh, { fit: "cover" }).png().toBuffer();
    const mask = Buffer.from(
      `<svg width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    );
    return await sharp(filled).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Renders a 2560×1440 YouTube channel banner recreating the owner's template:
 * mint→periwinkle gradient, bold navy headline, up to two blue QR codes each
 * with a hand-drawn arrow + caption, a SUBSCRIBE call-to-action block, and
 * 0–2 photo slots. Uploads to the public `assets` bucket and returns the URL.
 * Every text field falls back to the template default when omitted; QR groups
 * and photo slots are skipped when their input is absent.
 */
export async function renderAndSaveBanner(opts: RenderBannerOptions): Promise<{ url: string }> {
  const admin = createAdminClient();

  const headline = (opts.headline ?? DEFAULTS.headline).trim() || DEFAULTS.headline;
  const qr1Caption = (opts.qr1Caption ?? DEFAULTS.qr1Caption).trim();
  const subscribeKicker = (opts.subscribeKicker ?? DEFAULTS.subscribeKicker).trim();
  const subscribeMain = (opts.subscribeMain ?? DEFAULTS.subscribeMain).trim();
  const subscribeSub = (opts.subscribeSub ?? DEFAULTS.subscribeSub).trim();
  const qr2Caption = (opts.qr2Caption ?? DEFAULTS.qr2Caption).trim();
  const qr1Link = opts.qr1Link?.trim() || "";
  const qr2Link = opts.qr2Link?.trim() || "";
  const photoUrls = (opts.photoUrls || []).filter((u) => typeof u === "string" && u.trim()).slice(0, 2);

  // @ts-ignore -- sharp types unresolvable in some tsconfig setups; runtime import is fine
  const sharp = (await import("sharp")).default;

  // ── Base: mint→periwinkle horizontal gradient ──
  const bgSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GRAD_LEFT}"/>
      <stop offset="100%" stop-color="${GRAD_RIGHT}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`;
  const baseBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  // ── Raster composites (photos + QR images) collected first ──
  const composites: { input: Buffer; left: number; top: number }[] = [];

  // Photos — left cluster, side by side. box 340×300 at y=600.
  const PBW = 340, PBH = 300, PY = 600, PGAP = 30;
  const photoX = [250, 250 + PBW + PGAP];
  for (let i = 0; i < photoUrls.length; i++) {
    const buf = await roundedPhoto(sharp, photoUrls[i], PBW, PBH);
    if (buf) composites.push({ input: buf, left: photoX[i], top: PY });
  }

  // QR #1 — top area, right of the headline.
  const QR1 = 300, QR1X = 1650, QR1Y = 110;
  if (qr1Link) {
    const q = await makeQr(qr1Link, QR1);
    if (q) composites.push({ input: q, left: QR1X, top: QR1Y });
  }

  // QR #2 — middle-right, beside the SUBSCRIBE block.
  const QR2 = 290, QR2X = 1900, QR2Y = 640;
  if (qr2Link) {
    const q = await makeQr(qr2Link, QR2);
    if (q) composites.push({ input: q, left: QR2X, top: QR2Y });
  }

  // ── Vector overlay (text + arrows) ──
  const parts: string[] = [];

  // Headline "WATCHING ON TV?" — big navy, top-left, sized to clear QR1.
  const headlineSize = fitFont(headline.toUpperCase(), QR1X - 200 - 40, 150, 60);
  parts.push(textBlock([headline.toUpperCase()], 200, 290, headlineSize, NAVY));

  // QR1 caption + arrow (only when QR1 is present).
  if (qr1Link && qr1Caption) {
    const capSize = 48;
    const capLines = wrapLines(qr1Caption.toUpperCase(), capSize, W - 40 - (QR1X + QR1 + 40));
    const blockH = (capLines.length - 1) * capSize * 1.14;
    const capBaseline = QR1Y + QR1 / 2 - blockH / 2 + capSize * 0.35;
    parts.push(textBlock(capLines, QR1X + QR1 + 40, capBaseline, capSize, NAVY));
    // Arrow from the caption curving up-left into QR1's right edge.
    parts.push(curvedArrow(QR1X + QR1 + 60, QR1Y + QR1 / 2 + 55, QR1X + QR1 + 25, QR1Y + QR1 / 2 + 40, QR1X + QR1 - 12, QR1Y + QR1 / 2));
  }

  // Subscribe block — kicker / big main / sub, stacked at x=1080.
  const SX = 1080;
  if (subscribeKicker) {
    parts.push(textBlock(wrapLines(subscribeKicker.toUpperCase(), 46, 720), SX, 640, 46, NAVY));
  }
  if (subscribeMain) {
    const mainSize = fitFont(subscribeMain.toUpperCase(), 700, 150, 60);
    parts.push(textBlock([subscribeMain.toUpperCase()], SX, 770, mainSize, ROYAL));
  }
  if (subscribeSub) {
    // Single line (like the template), shrunk to clear QR2 if the user types more.
    const subSize = fitFont(subscribeSub.toUpperCase(), QR2X - SX - 40, 60, 34);
    parts.push(textBlock([subscribeSub.toUpperCase()], SX, 850, subSize, NAVY));
  }

  // QR2 caption + arrow (above/left of QR2, arrow pointing down into it).
  if (qr2Link && qr2Caption) {
    const capSize = 42;
    const capLines = wrapLines(qr2Caption.toUpperCase(), capSize, 700);
    const blockH = (capLines.length - 1) * capSize * 1.14;
    // Sit the block so its last line ends ~40px above the QR.
    const capBaseline = QR2Y - 40 - blockH;
    parts.push(textBlock(capLines, QR2X - 40, capBaseline, capSize, NAVY));
    // Arrow starts just below the caption and curves down into QR2's top edge.
    parts.push(curvedArrow(QR2X - 20, QR2Y - 28, QR2X + 10, QR2Y - 12, QR2X + 55, QR2Y + 12));
  }

  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;

  // Composite order: gradient → text/arrows → photos & QR on top (they never
  // overlap the text, so this only guarantees crisp raster edges).
  const png = await sharp(baseBuffer)
    .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }, ...composites])
    .png({ compressionLevel: 6 })
    .toBuffer();

  const storagePath = `banners/${opts.userId}/banner_${Date.now()}.png`;
  const { error: uploadErr } = await admin.storage
    .from("assets")
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);
  return { url: publicUrl };
}
