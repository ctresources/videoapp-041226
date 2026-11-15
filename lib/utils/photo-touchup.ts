import { readFileSync } from "fs";
import path from "path";
import * as opentypeNs from "opentype.js";
import sharp from "sharp";
import { geminiImage, type GeminiPart } from "@/lib/api/gemini";
import { glyphPathData } from "@/lib/utils/glyph-path-data";

// Old UMD package: its functions land on the namespace or on .default (same as banner-render.ts).
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

/**
 * Photo Touch-Up (2026-11-15, the owner's approved plan, #6): stage an empty
 * room, declutter, make a twilight front, or turn a gray sky blue. The home
 * itself is never changed, and the result carries a small corner label
 * because most MLSs require edited photos to say so.
 */

export type TouchupMode = "enhance" | "stage" | "declutter" | "twilight" | "sky";
export const TOUCHUP_MODES: TouchupMode[] = ["enhance", "stage", "declutter", "twilight", "sky"];
export const STAGE_STYLES = ["Modern", "Farmhouse", "Coastal", "Traditional"] as const;
export const TOUCHUP_MONTHLY_LIMIT = 30;

const KEEP = `Keep the property exactly as it is: the same walls, windows, doors, floors, ceilings, built-in fixtures, roofline, siding, landscaping layout and room shape, from the same camera position and lens. Do not add, remove or move any permanent part of the home. Photorealistic, like a professional real estate photo. No people and no new text. If the photo already has a watermark or MLS logo, keep it exactly as and where it is.`;

function prompt(mode: TouchupMode, style: string): string {
  switch (mode) {
    case "enhance":
      // Added 2026-11-15 at the owner's ask: a plain fix-up, nothing added or removed.
      return `Enhance this real estate photo like a professional photo editor: brighten dark areas and recover blown-out windows, correct the white balance to true neutral colors, straighten tilted vertical and horizontal lines, reduce noise and sharpen gently. Do not add, remove or restyle anything in the scene. ${KEEP}`;
    case "stage":
      return `Virtually stage this room with ${style.toLowerCase()} style furniture and decor that fits the room's size and purpose: real-looking pieces, sensible scale, natural shadows and the room's own light. ${KEEP}`;
    case "declutter":
      return `Remove clutter and personal items from this photo: loose objects on counters, floors and tables, cords, bins, cars in the driveway, trash cans and toys. Fill what was behind them naturally. Leave furniture that belongs. ${KEEP}`;
    case "twilight":
      return `Turn this exterior photo into a twilight shot: a deep blue dusk sky with a soft warm glow at the horizon, warm light glowing from every window and the porch and outdoor lights on. ${KEEP}`;
    case "sky":
      return `Replace the sky with a clear, bright blue sky with a few soft white clouds, and adjust the light on the home so it matches a sunny day. ${KEEP}`;
  }
}

export const LABEL_TEXT: Record<TouchupMode, string> = {
  enhance: "Digitally enhanced",
  stage: "Virtually staged",
  declutter: "Digitally enhanced",
  twilight: "Digitally enhanced",
  sky: "Digitally enhanced",
};

let _font: opentypeNs.Font | null = null;
function font(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "Montserrat-SemiBold.ttf"));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

/** A small "Virtually staged" pill in the bottom-right corner. */
async function addLabel(img: Buffer, text: string): Promise<Buffer> {
  const meta = await sharp(img).metadata();
  const W = meta.width ?? 1600, H = meta.height ?? 1067;
  const size = Math.max(14, Math.round(W * 0.018));
  const f = font();
  const textW = f.getAdvanceWidth(text, size);
  const padX = Math.round(size * 0.7), padY = Math.round(size * 0.45);
  const boxW = Math.round(textW + padX * 2), boxH = Math.round(size + padY * 2);
  const margin = Math.round(W * 0.015);
  const x = W - boxW - margin, y = H - boxH - margin;
  const d = glyphPathData(f.getPath(text, x + padX, y + padY + size * 0.82, size));
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${Math.round(boxH / 2)}" fill="#000" fill-opacity="0.55"/>
  <path d="${d}" fill="#fff"/>
</svg>`;
  return sharp(img).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 90 }).toBuffer();
}

export async function touchUpPhoto(source: Buffer, mode: TouchupMode, style: string, label: boolean): Promise<Buffer | null> {
  // Big enough to keep detail, small enough for one request.
  const input = await sharp(source).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const meta = await sharp(input).metadata();
  const ratio = (meta.width ?? 4) / (meta.height ?? 3);
  const aspect = ratio > 1.6 ? "16:9" : ratio > 1.4 ? "3:2" : ratio > 1.15 ? "4:3" : ratio > 0.9 ? "1:1" : ratio > 0.72 ? "3:4" : "2:3";
  const part: GeminiPart = { inlineData: { mimeType: "image/jpeg", data: input.toString("base64") } };
  const out = await geminiImage({ prompt: prompt(mode, style), images: [part], aspectRatio: aspect, label: "photo-touchup" });
  if (!out) return null;
  const jpg = await sharp(out.buf).jpeg({ quality: 90 }).toBuffer();
  return label ? addLabel(jpg, LABEL_TEXT[mode]) : jpg;
}
