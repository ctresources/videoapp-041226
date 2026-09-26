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

export const IMAGE_TEMPLATES = ["just_listed", "open_house", "market_update", "market_report", "blog_header", "blank"] as const;
export type ImageTemplate = (typeof IMAGE_TEMPLATES)[number];

/** One figure on a market-report card: what it is, and what it says. */
export interface ImageStat {
  label: string;
  value: string;
}

export interface ImageText {
  kicker?: string;
  headline?: string;
  subline?: string;
  /** #rrggbb for the kicker pill. */
  accent?: string;
  showLogo?: boolean;
  showHeadshot?: boolean;
  /**
   * Figures for the market-report card, drawn as real type.
   *
   * Never generated, never inferred: these are whatever the agent has in the
   * boxes on screen, which start from what the article itself said. A number
   * on one of these cards is a market claim going out under their name, so the
   * only thing that may put one there is a person.
   */
  stats?: ImageStat[];
  /** Optional attribution under the figures, e.g. "Bright MLS, September 2026". */
  source?: string;
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
  /**
   * What to do when the photo is not the frame's shape.
   *
   * "fill" crops from the centre, which is right for a photograph — a room, a
   * street, a face — where the edges are context and the middle is the point.
   * It is wrong for a picture that IS its edges: a market report, a flyer, a
   * chart, anything whose numbers live at the top and whose name lives at the
   * bottom. Cropping one of those to 16:9 throws away the half that mattered.
   */
  fit?: "fill" | "whole";
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
    const source = Buffer.from(await res.arrayBuffer());
    if (opts.fit === "whole") {
      /**
       * The whole picture, on a bed made of itself.
       *
       * Plain bars would be the obvious way to pad, and they look like a
       * mistake — a black-edged graphic posted to Instagram reads as something
       * that went wrong. A blurred, darkened copy of the same photo fills the
       * gap with the photo's own colours, so the result looks composed rather
       * than letterboxed, and the headline still has somewhere quiet to sit.
       */
      const bed = await sharp(source)
        .rotate()
        .resize(w, h, { fit: "cover" })
        .blur(40)
        .modulate({ brightness: 0.75 })
        .toBuffer();
      const whole = await sharp(source)
        .rotate()
        // "inside" never enlarges past the frame and never crops: the longest
        // edge meets the frame and the other is centred on the bed.
        .resize(w, h, { fit: "inside", withoutEnlargement: false })
        .toBuffer();
      buffer = await sharp(bed)
        .composite([{ input: whole, gravity: "center" }])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } else {
      buffer = await sharp(source)
        .rotate()
        .resize(w, h, { fit: "cover" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    }
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

/**
 * The figures block on a market-report card.
 *
 * Each stat is its own light card — a label in small grey type and the value
 * large above it — with a bar of the accent colour down its left edge. Two
 * across on a wide frame, stacked on a tall one, because four rows of numbers
 * in a 16:9 header would be four thin lines nobody reads at thumbnail size.
 *
 * Every size is derived from the frame rather than fixed, so the same code
 * draws a 1920x1080 header, a 1080x1350 post and a 1080x1920 story without
 * three layouts to keep in step.
 */
/**
 * The market-report panel: a light card of figures, as a report looks.
 *
 * The first attempt made each figure its own floating tile over the
 * photograph. It read as four labels scattered on a picture rather than as a
 * report — the thing agents actually circulate is a single light panel with
 * the month at the top and the numbers listed down it, one per line, label on
 * the left and figure on the right, with a rule between them.
 *
 * So: one panel, one column, right-aligned values, a small accent dot marking
 * each line. Every dimension is derived from the panel, so the same code draws
 * the left-hand panel of a 16:9 header and the full-width panel of a 9:16
 * story.
 */
function statPanel(
  stats: ImageStat[],
  opts: {
    x: number; y: number; w: number; h: number;
    accent: string;
    kicker: string;
    title: string;
    source: string;
  },
): string {
  const { x, y, w, h, accent } = opts;
  // Tighter than a poster margin: every pixel the chrome takes is a pixel off
  // the figures, which are the only reason this card exists.
  const pad = Math.round(w * 0.055);
  const inner = w - pad * 2;
  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(w * 0.035)}" fill="#ffffff" fill-opacity="0.96"/>`,
  ];

  let ty = y + pad;

  // The month, in the accent colour: small, spaced, the way a report dates
  // itself. Not a pill here — a pill on a white panel is a second object.
  if (opts.kicker) {
    const kSize = Math.round(w * 0.032);
    const k = fitWrapped(opts.kicker.toUpperCase(), inner, kSize, Math.round(kSize * 0.7), 1);
    if (k.lines[0]) {
      parts.push(lineToPaths(k.lines[0], x + pad, ty + k.size, k.size, accent));
      ty += Math.round(k.size * 1.7);
    }
  }

  if (opts.title) {
    const tSize = Math.round(w * 0.062);
    const t = fitWrapped(opts.title, inner, tSize, Math.round(tSize * 0.5), 2);
    const lh = Math.round(t.size * 1.16);
    t.lines.forEach((line, i) => {
      parts.push(lineToPaths(line, x + pad, ty + Math.round(t.size * 0.9) + i * lh, t.size, "#0f172a"));
    });
    ty += t.lines.length * lh + Math.round(pad * 0.42);
  }

  const sourceSize = opts.source ? Math.round(w * 0.028) : 0;
  const sourceH = opts.source ? Math.round(sourceSize * 2.4) : 0;
  const rowsTop = ty;
  const rowsH = y + h - pad - sourceH - rowsTop;
  const rowH = Math.floor(rowsH / stats.length);

  stats.forEach((stat, i) => {
    const cy = rowsTop + i * rowH;
    const mid = cy + Math.round(rowH / 2);
    const dot = Math.max(5, Math.round(rowH * 0.085));
    parts.push(`<circle cx="${x + pad + dot}" cy="${mid}" r="${dot}" fill="${accent}"/>`);

    const labelX = x + pad + dot * 2 + Math.round(pad * 0.55);
    // The value is sized first and the label gets what is left: a figure that
    // has to shrink to fit is the one thing on this card that must not.
    const valueSize = Math.round(rowH * 0.46);
    const value = fitWrapped(stat.value, Math.round(inner * 0.46), valueSize, Math.round(valueSize * 0.6), 1);
    const valueW = value.lines[0] ? textWidth(value.lines[0], value.size) : 0;
    const labelMax = x + w - pad - valueW - Math.round(pad * 0.6) - labelX;

    const labelSize = Math.round(rowH * 0.2);
    const label = fitWrapped(stat.label.toUpperCase(), Math.max(40, labelMax), labelSize, Math.round(labelSize * 0.62), 1);
    if (label.lines[0]) {
      parts.push(lineToPaths(label.lines[0], labelX, mid + Math.round(label.size * 0.36), label.size, "#475569"));
    }
    if (value.lines[0]) {
      parts.push(lineToPaths(value.lines[0], x + w - pad - valueW, mid + Math.round(value.size * 0.36), value.size, "#0f172a"));
    }
    // A hairline between figures, never under the last one: a rule along the
    // bottom edge of a panel reads as the panel being cut off.
    if (i < stats.length - 1) {
      const ly = cy + rowH;
      parts.push(`<rect x="${x + pad}" y="${ly}" width="${inner}" height="2" fill="#e2e8f0"/>`);
    }
  });

  if (opts.source) {
    parts.push(lineToPaths(`Source: ${opts.source}`, x + pad, y + h - pad, sourceSize, "#94a3b8"));
  }

  return parts.join("\n");
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
  const stats = (opts.text.stats ?? []).filter((s) => s.label.trim() && s.value.trim()).slice(0, 4);
  const source = (opts.text.source || "").trim();

  const M = Math.round(Math.min(w, h) * 0.07);

  const { data: profile } = await admin
    .from("profiles")
    .select("logo_url, avatar_url")
    .eq("id", opts.userId)
    .single();
  const prof = profile as { logo_url: string | null; avatar_url: string | null } | null;

  // Logo, bottom right, small, on a light see-through plate. Prepared before the
  // text is laid out because the two share the bottom edge: the text block is
  // narrowed by the plate's width so a long headline never runs under it.
  let logo: { image: Buffer; plate: Buffer; plateW: number; plateH: number; pad: number } | null = null;
  if (opts.text.showLogo && prof?.logo_url) {
    try {
      const res = await fetch(prof.logo_url);
      if (res.ok) {
        const image = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize({ width: Math.round(w * 0.11), height: Math.round(h * (landscape ? 0.06 : 0.04)), fit: "inside" })
          .png()
          .toBuffer();
        const meta = await sharp(image).metadata();
        const lw = meta.width || 0, lh = meta.height || 0;
        const pad = Math.round(Math.max(lw, lh) * 0.12) + 6;
        const plateW = lw + pad * 2, plateH = lh + pad * 2;
        const plate = Buffer.from(
          `<svg width="${plateW}" height="${plateH}" xmlns="http://www.w3.org/2000/svg"><rect width="${plateW}" height="${plateH}" rx="${Math.round(pad * 0.9)}" fill="#ffffff" fill-opacity="0.6"/></svg>`,
        );
        logo = { image, plate, plateW, plateH, pad };
      }
    } catch { /* the image still renders without the logo */ }
  }

  const maxW = w - 2 * M - (logo ? logo.plateW + Math.round(M * 0.5) : 0);
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

  /**
   * A card of figures reads top-down, not bottom-up.
   *
   * Everything else this renderer draws is a caption on a photograph, so it
   * sits at the bottom with a scrim under it. A market report is the opposite:
   * the title says what these numbers are and has to come first, the figures
   * are the subject rather than an overlay, and the whole thing wants an even
   * dark ground rather than a gradient that fades out where the numbers are.
   */
  if (stats.length) {
    /**
     * A report, not a caption.
     *
     * The photograph becomes the setting and the panel carries everything
     * else: on a wide frame the panel takes the left and the picture keeps the
     * right, where the agent's face goes; on a tall one the picture is a band
     * across the top with the panel below it. Either way the figures live on
     * white, which is what makes this read as a market report rather than as a
     * post with numbers on it.
     */
    const panelW = landscape ? Math.round(w * 0.6) : w - 2 * M;
    const panelX = M;
    const panelY = landscape ? M : Math.round(h * 0.3);
    const panelH = h - panelY - M;

    const panel = statPanel(stats, {
      x: panelX, y: panelY, w: panelW, h: panelH,
      accent, kicker, title: headline, source,
    });

    // Darkened only where the panel is not: the picture behind a 96% white
    // card gains nothing from a scrim, and the agent's face loses by it.
    const openX = landscape ? panelX + panelW : 0;
    const openW = landscape ? w - openX : w;
    const openH = landscape ? h : panelY;
    const overlaySvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${openX}" y="0" width="${openW}" height="${openH}" fill="#0b1220" fill-opacity="0.25"/>
  ${panel}
</svg>`;

    /**
     * The face, big, in the space the panel left.
     *
     * A 17%-wide ring in a corner is a byline. On a report that someone is
     * meant to recognise at a glance in a feed, the agent IS half the point,
     * so it takes the open side of the frame at the size that space allows.
     */
    const faceD = landscape
      ? Math.min(Math.round(w * 0.3), Math.round(h * 0.62))
      : Math.round(Math.min(w, h) * 0.26);
    const headshotAt = landscape
      ? { x: Math.round(openX + (openW - faceD) / 2), y: Math.round((h - faceD) / 2), d: faceD }
      : { x: w - M - faceD, y: Math.round(panelY - faceD * 0.62), d: faceD };

    return await composeAndUpload({
      admin, sharp, base, w, h, M, overlay: Buffer.from(overlaySvg),
      userId: opts.userId, logo,
      headshot: opts.text.showHeadshot ? prof?.avatar_url ?? null : null,
      headshotAt,
    });
  }

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

  return await composeAndUpload({
    admin, sharp, base, w, h, M, overlay: Buffer.from(overlay),
    userId: opts.userId, logo,
    headshot: opts.text.showHeadshot ? prof?.avatar_url ?? null : null,
  });
}

/**
 * The last step both layouts share: overlay, brand marks, upload.
 *
 * Extracted when the market-report card arrived. Everything above it differs
 * between a caption on a photograph and a card of figures; everything from
 * here down — the logo plate bottom right, the ringed headshot top left, the
 * JPEG, the storage path — is the same picture furniture either way, and two
 * copies of it would have drifted apart by the second change.
 */
async function composeAndUpload(o: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: any;
  base: Buffer;
  w: number; h: number; M: number;
  overlay: Buffer;
  userId: string;
  logo: { image: Buffer; plate: Buffer; plateW: number; plateH: number; pad: number } | null;
  headshot: string | null;
  /** Where and how big, when a layout has somewhere better than the corner. */
  headshotAt?: { x: number; y: number; d: number };
}): Promise<string> {
  const { admin, sharp, base, w, h, M } = o;
  const composites: { input: Buffer; left: number; top: number }[] = [
    { input: o.overlay, left: 0, top: 0 },
  ];

  if (o.logo) {
    const top = h - M - o.logo.plateH;
    composites.push({ input: o.logo.plate, left: w - M - o.logo.plateW, top });
    composites.push({ input: o.logo.image, left: w - M - o.logo.plateW + o.logo.pad, top: top + o.logo.pad });
  }

  // Headshot, top left, in a white ring.
  if (o.headshot) {
    try {
      const res = await fetch(o.headshot);
      if (res.ok) {
        const d = o.headshotAt?.d ?? Math.round(Math.min(w, h) * 0.17);
        const ring = Math.max(6, Math.round(d * 0.035));
        const mask = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
        const face = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize(d, d, { fit: "cover", position: "attention" })
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer();
        const outer = d + ring * 2;
        const ringSvg = Buffer.from(`<svg width="${outer}" height="${outer}"><circle cx="${outer / 2}" cy="${outer / 2}" r="${outer / 2}" fill="#ffffff"/></svg>`);
        // Clamped to the frame: a layout can ask for a face half off the edge,
        // and sharp refuses a composite that does not fit rather than cropping.
        const left = Math.max(0, Math.min(w - outer, (o.headshotAt?.x ?? M) - ring));
        const top = Math.max(0, Math.min(h - outer, (o.headshotAt?.y ?? M) - ring));
        composites.push({ input: ringSvg, left, top });
        composites.push({ input: face, left: left + ring, top: top + ring });
      }
    } catch { /* the image still renders without the headshot */ }
  }

  const out = await sharp(base).composite(composites).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const path = `images/${o.userId}/img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await admin.storage.from("assets").upload(path, out, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return publicUrl(admin, path);
}
