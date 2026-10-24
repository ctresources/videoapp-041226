/**
 * Fitting a photo or clip into a video of another shape (2026-10-24, the
 * owner's ask).
 *
 * Everything used to be cropped to fill the frame. For a photo close to the
 * video's shape that is right: a landscape phone photo (4:3) in a 16:9 video
 * loses a little top and bottom. For a photo of the other orientation it
 * threw most of the picture away: a vertical photo in a horizontal video kept
 * a band about a third of its height, roof and lawn gone.
 *
 * So the rule, everywhere a photo or clip is placed: close in shape (within
 * FILL_RANGE), fill the frame as before; otherwise show the whole thing at its
 * own size over a blurred, slightly darkened copy of itself, the way a wide
 * clip is already carried in a tall Cinematic reel. Nothing the photo shows
 * is lost.
 */

import { needsBlurFill } from "@/lib/utils/fit-rule";
export { needsBlurFill };

/**
 * A still fitted to outW×outH: cropped to fill when close in shape, otherwise
 * whole over a blurred copy. Applies EXIF rotation first, so a phone portrait
 * is measured upright. Returns a JPEG.
 */
export async function fitImageBuffer(input: Buffer, outW: number, outH: number): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharp = ((await import("sharp")) as any).default;
  const upright: Buffer = await sharp(input).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (!needsBlurFill(w, h, outW, outH)) {
    return sharp(upright).resize(outW, outH, { fit: "cover", position: "centre" }).jpeg({ quality: 88 }).toBuffer();
  }

  // The backdrop: blurred small (cheap, and smaller is softer), then scaled up.
  const bw = Math.max(16, Math.round(outW / 16));
  const bh = Math.max(16, Math.round(outH / 16));
  // Two steps: sharp keeps only the last resize in one pipeline, so shrinking
  // and growing in a single chain never actually shrinks.
  const small: Buffer = await sharp(upright).resize(bw, bh, { fit: "cover" }).blur(2).toBuffer();
  const backdrop: Buffer = await sharp(small)
    .resize(outW, outH, { fit: "fill" })
    .blur(8)
    .modulate({ brightness: 0.88 })
    .toBuffer();
  const front: Buffer = await sharp(upright).resize(outW, outH, { fit: "inside" }).toBuffer();
  const fm = await sharp(front).metadata();
  return sharp(backdrop)
    .composite([{
      input: front,
      left: Math.round((outW - (fm.width ?? outW)) / 2),
      top: Math.round((outH - (fm.height ?? outH)) / 2),
    }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

/**
 * The ffmpeg filter that fits one clip input to width×height by the same
 * rule. `pre` is anything to run on the input first (timing, fps), ending
 * without a comma; `post` runs on the fitted result. The clip's own size is
 * needed to choose; unknown (0) fills as before.
 */
export function ffmpegFitFilter(opts: {
  input: string; output: string; width: number; height: number;
  srcW: number; srcH: number; pre?: string; post?: string; tag: string;
}): string[] {
  const { input, output, width, height, srcW, srcH, tag } = opts;
  const pre = opts.pre ? `${opts.pre},` : "";
  const post = opts.post ? `,${opts.post}` : "";
  if (!needsBlurFill(srcW, srcH, width, height)) {
    return [`${input}${pre}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}${post}${output}`];
  }
  const bw = Math.round(width / 8) * 2;
  const bh = Math.round(height / 8) * 2;
  return [
    `${input}${pre}split=2[fg${tag}][bg${tag}]`,
    `[bg${tag}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},` +
      `boxblur=10:2,scale=${width}:${height},eq=brightness=-0.06[bb${tag}]`,
    `[fg${tag}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fs${tag}]`,
    `[bb${tag}][fs${tag}]overlay=(W-w)/2:(H-h)/2${post}${output}`,
  ];
}

/**
 * A video file's width and height, without ffprobe (not installed here):
 * ffmpeg prints the stream line when asked to open a file with no output.
 * Rotation metadata (phone video) is applied, so a portrait clip reads tall.
 * Zeros when it cannot tell, which means "fill as before".
 */
export async function probeVideoSize(filePath: string): Promise<{ width: number; height: number }> {
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  const stderr = await new Promise<string>((resolve) => {
    let buf = "";
    ffmpeg(filePath)
      .on("stderr", (line: string) => { buf += line + "\n"; })
      .on("error", () => resolve(buf))
      .on("end", () => resolve(buf))
      .addOption("-t", "0.1")
      .addOption("-f", "null")
      .save(process.platform === "win32" ? "NUL" : "/dev/null");
  });
  const m = stderr.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?\s(\d{2,5})x(\d{2,5})/);
  if (!m) return { width: 0, height: 0 };
  let width = Number(m[1]);
  let height = Number(m[2]);
  const rot = stderr.match(/rotation of (-?\d+(?:\.\d+)?) degrees|rotate\s*:\s*(-?\d+)/);
  const deg = Math.abs(Number(rot?.[1] ?? rot?.[2] ?? 0)) % 180;
  if (deg === 90) [width, height] = [height, width];
  return { width, height };
}
