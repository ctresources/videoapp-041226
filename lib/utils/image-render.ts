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
/**
 * Two faces.
 *
 * Everything here was set in Archivo Black, which is right for a headline over
 * a photograph and wrong for a row of labels: at small sizes a heavy display
 * face turns a label into a second headline competing with the figure beside
 * it. Montserrat carries the small text — labels, the month, the source line —
 * and the display face keeps the title and the numbers.
 *
 * Both are already in the repo. No third file, and nothing fetched at render
 * time: a font that has to be downloaded is a picture that fails at midnight.
 */
type FaceName = "display" | "text";
const _faces: Partial<Record<FaceName, opentypeNs.Font>> = {};

/**
 * Literal paths, one per face, and both under /fonts.
 *
 * Built once with the directory split out of a table — path.join(cwd(),
 * ...dir.split("/"), file) — which the deployment's file tracer cannot
 * resolve. Unable to tell which file is read, it pulled in enough of the
 * project to take this function from well under the limit to 375MB, and the
 * build refused it. A traced path has to be visible as a string right here.
 *
 * Montserrat therefore lives beside Archivo Black in /fonts rather than being
 * read out of /public, which is served rather than bundled.
 */
function getFont(face: FaceName = "display"): opentypeNs.Font {
  const cached = _faces[face];
  if (cached) return cached;
  const buf = face === "text"
    ? readFileSync(path.join(process.cwd(), "fonts", "Montserrat-SemiBold.ttf"))
    : readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
  const parsed = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  _faces[face] = parsed;
  return parsed;
}

function textWidth(text: string, size: number, face: FaceName = "display"): number {
  return getFont(face).getAdvanceWidth(text, size);
}

/** One path per word, laid out by advance width. */
function lineToPaths(line: string, x: number, y: number, size: number, fill: string, face: FaceName = "display"): string {
  const space = textWidth(" ", size, face);
  let cx = x;
  const out: string[] = [];
  for (const word of line.split(" ")) {
    if (word) out.push(`<path d="${glyphPathData(getFont(face).getPath(word, cx, y, size))}" fill="${fill}"/>`);
    cx += textWidth(word, size, face) + space;
  }
  return out.join("");
}

function wrapLines(text: string, size: number, maxWidth: number, face: FaceName = "display"): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(t, size, face) > maxWidth) {
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
function fitWrapped(text: string, maxWidth: number, start: number, min: number, maxLines: number, face: FaceName = "display") {
  let size = start;
  for (;;) {
    const lines = wrapLines(text, size, maxWidth, face);
    const fits = lines.length <= maxLines && lines.every((l) => textWidth(l, size, face) <= maxWidth);
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
    strap: string;
    source: string;
  },
): string {
  const { x, y, w, h, accent } = opts;
  const pad = Math.round(w * 0.062);
  const inner = w - pad * 2;
  // Ink, not black. A printed market report is navy on cream, and near-black
  // on white is the thing that made the first version look like a web page.
  const INK = "#14375c";
  const MUTED = "#3f6184";

  const parts: string[] = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f8f5ef"/>`,
  ];

  /**
   * The figures are given their share of the panel FIRST.
   *
   * Laying the header out top-down and letting the rows have the remainder is
   * how the first attempt ended up with 22px numbers: a long title wrapped to
   * three lines at display size and quietly ate two thirds of the sheet. A
   * market report exists to show figures, so they take a little over half the
   * panel by right, and the masthead is fitted into what is left — shrinking
   * the title, which can afford it, rather than the numbers, which cannot.
   */
  const sourceSize = opts.source ? Math.round(w * 0.026) : 0;
  const sourceH = opts.source ? Math.round(sourceSize * 2.6) : 0;
  const rowsH = Math.round(h * 0.47);
  const rowsTop = y + h - pad - sourceH - rowsH;
  const rowH = Math.floor(rowsH / stats.length);

  let ty = y + pad;

  // Month, rule and strap are small and fixed; the title takes what remains.
  const kSize = opts.kicker ? Math.round(w * 0.05) : 0;
  const kH = opts.kicker ? Math.round(kSize * 1.35) : 0;
  const strapSize = Math.round(w * 0.028);
  const strapH = Math.round(strapSize * 2.1) + Math.round(pad * 0.42);
  const titleRoom = Math.max(Math.round(h * 0.08), rowsTop - ty - kH - strapH - Math.round(pad * 0.35));

  if (opts.title) {
    // Two lines at most. "Market Update — Blue Bell, PA" over three lines is a
    // headline where a masthead belongs.
    const start = Math.min(Math.round(w * 0.1), Math.round(titleRoom * 0.86));
    let t = fitWrapped(opts.title, inner, start, Math.round(w * 0.035), 2);
    // fitWrapped only knows about width. A title that wraps to two lines can
    // still be taller than the room above the rule, and a masthead running
    // over its own strap line is the one flaw nobody would forgive.
    if (t.lines.length * Math.round(t.size * 1.08) > titleRoom) {
      const capped = Math.floor(titleRoom / (t.lines.length * 1.08));
      t = fitWrapped(opts.title, inner, Math.max(Math.round(w * 0.03), capped), Math.round(w * 0.03), 2);
    }
    const lh = Math.round(t.size * 1.08);
    t.lines.forEach((line, i) => {
      parts.push(lineToPaths(line, x + pad, ty + Math.round(t.size * 0.86) + i * lh, t.size, INK));
    });
    ty += t.lines.length * lh + Math.round(pad * 0.35);
  }

  if (opts.kicker) {
    const k = fitWrapped(opts.kicker, inner, kSize, Math.round(kSize * 0.6), 1, "text");
    if (k.lines[0]) {
      parts.push(lineToPaths(k.lines[0], x + pad, ty + k.size, k.size, INK, "text"));
      ty += kH;
    }
  }
  parts.push(`<rect x="${x + pad}" y="${ty}" width="${Math.round(inner * 0.5)}" height="3" fill="${accent}"/>`);
  ty += Math.round(pad * 0.42);
  if (opts.strap) {
    const st = fitWrapped(opts.strap.toUpperCase(), inner, strapSize, Math.round(strapSize * 0.6), 1, "text");
    if (st.lines[0]) {
      // Letter-spaced by hand: the renderer lays out whole words, and a market
      // report's strap line has to breathe.
      let cx = x + pad;
      const extra = Math.round(st.size * 0.22);
      for (const ch of st.lines[0]) {
        if (ch !== " ") parts.push(lineToPaths(ch, cx, ty + st.size, st.size, MUTED, "text"));
        cx += textWidth(ch, st.size, "text") + extra;
      }
    }
  }

  stats.forEach((stat, i) => {
    const cy = rowsTop + i * rowH;
    const mid = cy + Math.round(rowH / 2);

    // The badge: a filled disc in the accent colour, the size of the label
    // beside it. No glyph inside — a shape nobody can name beats a wrong icon.
    const r = Math.round(rowH * 0.17);
    parts.push(`<circle cx="${x + pad + r}" cy="${mid}" r="${r}" fill="${accent}" fill-opacity="0.9"/>`);

    const labelX = x + pad + r * 2 + Math.round(pad * 0.5);
    const valueSize = Math.round(rowH * 0.5);
    const value = fitWrapped(stat.value, Math.round(inner * 0.44), valueSize, Math.round(valueSize * 0.55), 1);
    const valueW = value.lines[0] ? textWidth(value.lines[0], value.size) : 0;

    // Two lines for the label, as on a printed sheet: "Months of / inventory"
    // reads better than one long line squeezed to fit beside a figure.
    const labelMax = Math.max(60, x + w - pad - valueW - Math.round(pad * 0.5) - labelX);
    const labelSize = Math.round(rowH * 0.2);
    const label = fitWrapped(stat.label, labelMax, labelSize, Math.round(labelSize * 0.62), 2, "text");
    const labelLH = Math.round(label.size * 1.15);
    const labelTop = mid - Math.round((label.lines.length * labelLH) / 2) + Math.round(label.size * 0.85);
    label.lines.forEach((line, j) => {
      parts.push(lineToPaths(line, labelX, labelTop + j * labelLH, label.size, MUTED, "text"));
    });

    if (value.lines[0]) {
      parts.push(lineToPaths(value.lines[0], x + w - pad - valueW, mid + Math.round(value.size * 0.36), value.size, INK));
    }
    if (i < stats.length - 1) {
      parts.push(`<rect x="${x + pad}" y="${cy + rowH}" width="${inner}" height="2" fill="#dfd8cc"/>`);
    }
  });

  if (opts.source) {
    parts.push(lineToPaths(`Source: ${opts.source}`, x + pad, y + h - pad, sourceSize, MUTED, "text"));
  }

  return parts.join("\n");
}

/**
 * The plate the agent's name sits on, over the photograph.
 *
 * The sample this follows puts the name in white on a deep block at the foot
 * of the picture, and it is the difference between a graphic with a face on it
 * and one that says who is speaking. Drawn from the profile, so nobody types
 * their own name into a box that already knows it.
 */
function namePlate(opts: {
  x: number; y: number; w: number;
  name: string; strap: string;
}): { svg: string; height: number } {
  const { x, y, w } = opts;
  const pad = Math.round(w * 0.075);
  const nameSize = Math.round(w * 0.11);
  const name = fitWrapped(opts.name, w - pad * 2, nameSize, Math.round(nameSize * 0.45), 2);
  const lh = Math.round(name.size * 1.06);
  const strapSize = Math.round(w * 0.036);
  const strap = opts.strap
    ? fitWrapped(opts.strap, w - pad * 2, strapSize, Math.round(strapSize * 0.6), 2, "text")
    : { size: 0, lines: [] as string[] };
  const strapLH = Math.round(strap.size * 1.25);
  const h = pad + name.lines.length * lh + (strap.lines.length ? Math.round(pad * 0.25) + strap.lines.length * strapLH : 0) + pad;

  const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#14375c" fill-opacity="0.94"/>`];
  let ty = y + pad;
  name.lines.forEach((line, i) => {
    parts.push(lineToPaths(line, x + pad, ty + Math.round(name.size * 0.86) + i * lh, name.size, "#ffffff"));
  });
  ty += name.lines.length * lh + Math.round(pad * 0.25);
  strap.lines.forEach((line, i) => {
    parts.push(lineToPaths(line, x + pad, ty + strap.size + i * strapLH, strap.size, "#c9d8e8", "text"));
  });
  return { svg: parts.join("\n"), height: h };
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
    // Name and brokerage for the market-report plate: the same on every card
    // this account makes, so they are read rather than typed.
    .select("logo_url, avatar_url, full_name, company_name")
    .eq("id", opts.userId)
    .single();
  const prof = profile as {
    logo_url: string | null; avatar_url: string | null;
    full_name: string | null; company_name: string | null;
  } | null;

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
     * A market report sheet: panel on one side, the agent on the other.
     *
     * Flush to the edges rather than floating with a margin — the sample this
     * follows is a printed sheet, and a rounded card with the photograph
     * showing around all four sides reads as a social post instead. The panel
     * owns its side of the frame completely, the picture owns the rest.
     */
    const panelW = landscape ? Math.round(w * 0.62) : w;
    const panelX = 0;
    const panelY = landscape ? 0 : Math.round(h * 0.26);
    const panelH = h - panelY;

    // Sits under the month, saying what the sheet is. The Second line box when
    // it has been filled; this phrase when it has not, because every one of
    // these sheets says it and nobody should have to type it.
    const strap = subline || "Real Estate Market Report";

    const parts = [statPanel(stats, {
      x: panelX, y: panelY, w: panelW, h: panelH,
      accent, kicker, title: headline, strap, source,
    })];

    /**
     * Who this is from, on the picture rather than in the panel.
     *
     * Name and brokerage come from the profile: they are the same on every
     * card this account will ever make, and a box for them would be a box
     * nobody should have to fill twice.
     */
    const plateW = landscape ? w - panelW : Math.round(w * 0.62);
    const plateX = landscape ? panelW : w - plateW;
    if (prof?.full_name && opts.text.showHeadshot) {
      const plate = namePlate({
        x: plateX,
        y: 0,
        w: plateW,
        name: prof.full_name,
        strap: [prof.company_name].filter(Boolean).join(" · "),
      });
      // Pinned to the bottom of the picture area: the panel's foot on a wide
      // frame, the band's foot on a tall one.
      // Laid out at y=0 and moved as a group: the plate's height is only
      // known once its name has wrapped, and a transform beats threading an
      // offset back through every path in it.
      const plateY = (landscape ? h : panelY) - plate.height;
      parts.push(`<g transform="translate(0, ${plateY})">${plate.svg}</g>`);
    }

    const overlaySvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${parts.join("\n")}
</svg>`;

    /**
     * The photograph of the agent fills the open side, not a circle in it.
     *
     * A ringed thumbnail is a byline. On a sheet somebody is meant to
     * recognise at a glance, the agent is half the design, so the headshot is
     * cover-cropped into the whole open area — the same crop the renderer
     * gives every other background photo.
     */
    const faceW = landscape ? w - panelW : w;
    const faceH = landscape ? h : panelY;

    return await composeAndUpload({
      admin, sharp, base, w, h, M, overlay: Buffer.from(overlaySvg),
      userId: opts.userId, logo,
      headshot: opts.text.showHeadshot ? prof?.avatar_url ?? null : null,
      headshotFill: { x: landscape ? panelW : 0, y: 0, w: faceW, h: faceH },
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
  /**
   * A rectangle for the headshot to fill, cover-cropped, drawn UNDER the
   * overlay rather than over it — the market-report sheet gives the picture a
   * whole side of the frame, and a name plate has to sit on top of it.
   */
  headshotFill?: { x: number; y: number; w: number; h: number };
}): Promise<string> {
  const { admin, sharp, base, w, h, M } = o;
  const composites: { input: Buffer; left: number; top: number }[] = [];

  // First, so the overlay's panel and plate land on top of it.
  if (o.headshot && o.headshotFill) {
    try {
      const res = await fetch(o.headshot);
      if (res.ok) {
        const fill = o.headshotFill;
        const img = await sharp(Buffer.from(await res.arrayBuffer()))
          .rotate()
          // "attention" keeps the face when a square portrait has to become a
          // tall strip, which is the usual shape of the space left here.
          .resize(fill.w, fill.h, { fit: "cover", position: "attention" })
          .png()
          .toBuffer();
        composites.push({ input: img, left: fill.x, top: fill.y });
      }
    } catch { /* the sheet still renders on its background */ }
  }

  composites.push({ input: o.overlay, left: 0, top: 0 });

  if (o.logo) {
    const top = h - M - o.logo.plateH;
    composites.push({ input: o.logo.plate, left: w - M - o.logo.plateW, top });
    composites.push({ input: o.logo.image, left: w - M - o.logo.plateW + o.logo.pad, top: top + o.logo.pad });
  }

  // Headshot, top left, in a white ring — the caption layouts' version.
  if (o.headshot && !o.headshotFill) {
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
