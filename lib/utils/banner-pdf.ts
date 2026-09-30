import { readFileSync } from "fs";
import path from "path";
import { LineCapStyle, PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * "Download for Canva": the banner as a PDF whose parts stay parts.
 *
 * The PNG draws every word as glyph outlines, which is right for a picture
 * and useless for editing: uploaded to Canva it is one flat image. Canva
 * opens a PDF as a design instead, turning real text into text boxes and
 * each image into its own element. So the renderers describe what they drew
 * (a BannerScene) alongside the PNG, and this lays the same things out again
 * as live PDF objects, from the same coordinates, so the two always match.
 */

export interface SceneText {
  text: string;
  /** Left edge of the line, in canvas pixels. */
  x: number;
  /** Baseline, in canvas pixels from the top. */
  baseline: number;
  size: number;
  color: string;
}

export interface SceneImage {
  png: Buffer;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A vector shape (the YouTube banner's arrows), as SVG path data. */
export interface SceneShape {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface BannerScene {
  W: number;
  H: number;
  bgLeft: string;
  bgRight: string;
  /** The background as drawn, used when it is a gradient (PDF has no simple gradient fill). */
  bgPng: Buffer;
  texts: SceneText[];
  images: SceneImage[];
  shapes: SceneShape[];
}

export function emptyScene(W: number, H: number, bgLeft: string, bgRight: string, bgPng: Buffer): BannerScene {
  return { W, H, bgLeft, bgRight, bgPng, texts: [], images: [], shapes: [] };
}

function color(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function sceneToPdf(scene: BannerScene, title: string): Promise<Buffer> {
  const { W, H } = scene;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setCreator("SparkReels");
  // The whole font, not a subset: a subset holds only the letters already on
  // the banner, and a word retyped in Canva would fall back to another font.
  const font = await doc.embedFont(
    readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf")),
    { subset: false },
  );

  // One point per canvas pixel, so the page is the banner's own size.
  const page = doc.addPage([W, H]);

  // A solid background stays a shape, whose color Canva can change; a
  // gradient has to come in as an image.
  if (scene.bgLeft.toLowerCase() === scene.bgRight.toLowerCase()) {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: color(scene.bgLeft) });
  } else {
    page.drawImage(await doc.embedPng(scene.bgPng), { x: 0, y: 0, width: W, height: H });
  }

  // SVG space is y-down from the top; drawn from (0, H), pdf-lib flips it.
  for (const s of scene.shapes) {
    page.drawSvgPath(s.d, {
      x: 0,
      y: H,
      ...(s.fill ? { color: color(s.fill) } : {}),
      ...(s.stroke ? { borderColor: color(s.stroke), borderWidth: s.strokeWidth ?? 1, borderLineCap: LineCapStyle.Round } : {}),
    });
  }

  for (const t of scene.texts) {
    page.drawText(t.text, { x: t.x, y: H - t.baseline, size: t.size, font, color: color(t.color) });
  }

  // Images last, as in the PNG, where photos and QR codes sit on top.
  for (const img of scene.images) {
    page.drawImage(await doc.embedPng(img.png), { x: img.x, y: H - img.y - img.h, width: img.w, height: img.h });
  }

  return Buffer.from(await doc.save());
}
