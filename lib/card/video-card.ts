import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { escapeDrawtext, stageFont } from "@/lib/api/ffmpeg-render";
import { probeVideoSize } from "@/lib/utils/fit-frame";
import { cardPhone, cardTitle, cardUrl, type Card } from "@/lib/card/card";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * The video card (2026-10-30, the owner's approved storyboard): the agent's
 * intro with their name strip sliding in over the first seconds, then a
 * five-second end card with their photo, phone, email, website and a QR code
 * to their card page. Made here with FFmpeg from a finished video, so it costs
 * nothing from their plan. Returns the MP4.
 */

const END_SECONDS = 5;
const esc = (s: string) => escapeDrawtext(s).replace(/%/g, "\\%");
const hex = (c: string) => c.replace("#", "0x");

export async function makeVideoCard(card: Card, videoUrl: string): Promise<Buffer> {
  const dir = join(tmpdir(), `card-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const inPath = join(dir, "in.mp4");
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error("Couldn't read your intro video.");
    await fs.writeFile(inPath, Buffer.from(await res.arrayBuffer()));
    const probed = await probeVideoSize(inPath);
    // Even sizes, at most 1080 on the short side, so the encode stays quick.
    const scale = Math.min(1, 1080 / Math.max(1, Math.min(probed.width || 1080, probed.height || 1920)));
    const W = Math.round(((probed.width || 1080) * scale) / 2) * 2;
    const H = Math.round(((probed.height || 1920) * scale) / 2) * 2;
    const S = Math.min(W, H);

    const head = await stageFont("ExtraBold", dir);
    const body = (await stageFont("SemiBold", dir)) ?? head;
    if (!head || !body) throw new Error("The card's lettering couldn't load. Try again.");

    const p = card.profile;
    const color = /^#[0-9a-fA-F]{6}$/.test(card.settings.color ?? "") ? card.settings.color! : ((p.brand_colors ?? []).find((c) => /^#[0-9a-fA-F]{6}$/.test(c)) ?? "#1B5E82");
    const name = (p.full_name || "Your agent").trim();
    const sub = [cardTitle(card), p.company_name].filter(Boolean).join(" · ");

    // ── The end card's picture (no text: FFmpeg draws the words) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sharp = ((await import("sharp")) as any).default;
    const QRCode = (await import("qrcode")).default;
    const cardW = Math.round(W * 0.84);
    const cardX = Math.round((W - cardW) / 2);
    const avatarD = Math.round(S * 0.24);
    const qrD = Math.round(S * 0.3);
    const gap = Math.round(S * 0.03);
    const nameSize = Math.round(S * 0.062);
    const subSize = Math.round(S * 0.036);
    const lineSize = Math.round(S * 0.04);
    const contact = [
      cardPhone(p),
      p.email,
      p.website?.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    ].filter((x): x is string => !!x).slice(0, 3);
    const cardH = gap * 2 + avatarD + gap + Math.round(nameSize * 1.4) + Math.round(subSize * 1.6)
      + contact.length * Math.round(lineSize * 1.55) + gap + qrD + Math.round(subSize * 1.8) + gap;
    const cardY = Math.max(Math.round(S * 0.04), Math.round((H - cardH) / 2));
    const avatarY = cardY + gap * 2;
    const nameY = avatarY + avatarD + gap;
    const subY = nameY + Math.round(nameSize * 1.4);
    const linesY = subY + Math.round(subSize * 1.6);
    const qrY = linesY + contact.length * Math.round(lineSize * 1.55) + gap;
    const scanY = qrY + qrD + Math.round(subSize * 0.5);

    const layers: { input: Buffer; left: number; top: number }[] = [];
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}"><rect width="${cardW}" height="${cardH}" rx="${Math.round(S * 0.04)}" fill="#ffffff"/></svg>`),
      left: cardX, top: cardY,
    });
    if (p.avatar_url) {
      const a = await fetch(p.avatar_url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (a?.ok) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarD}" height="${avatarD}"><circle cx="${avatarD / 2}" cy="${avatarD / 2}" r="${avatarD / 2}" fill="#fff"/></svg>`);
        const round = await sharp(Buffer.from(await a.arrayBuffer())).rotate().resize(avatarD, avatarD, { fit: "cover", position: "attention" })
          .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
        layers.push({ input: round, left: Math.round((W - avatarD) / 2), top: avatarY });
      }
    }
    const qr = await QRCode.toBuffer(cardUrl(card.slug), { margin: 1, width: qrD, color: { dark: "#111111", light: "#ffffff" } });
    layers.push({ input: qr, left: Math.round((W - qrD) / 2), top: qrY });
    const endPng = join(dir, "end.png");
    await sharp({ create: { width: W, height: H, channels: 3, background: color } }).composite(layers).png().toFile(endPng);

    // ── Words ──
    const centered = (font: string, size: number, text: string, y: number, colorHex: string) =>
      `drawtext=${font}text='${esc(text)}':fontsize=${size}:fontcolor=${colorHex}:x=(w-text_w)/2:y=${y}`;
    const endText = [
      centered(head, nameSize, name, nameY, "0x24221e"),
      sub && centered(body, subSize, sub, subY, "0x77736a"),
      ...contact.map((c, i) => centered(body, lineSize, c, linesY + i * Math.round(lineSize * 1.55), "0x24221e")),
      centered(body, Math.round(subSize * 0.9), "Scan to save my contact", scanY, "0x77736a"),
    ].filter(Boolean).join(",");

    // The name strip over the opening seconds, white with a brand-colour edge.
    const stripSize = Math.round(S * 0.055);
    const stripSub = Math.round(S * 0.034);
    const stripY = Math.round(H * (H > W ? 0.72 : 0.7));
    const stripX = Math.round(S * 0.06);
    const on = "enable='between(t,0.4,4.8)'";
    const strip = [
      // Just left of the white boxes (their padding would cover it).
      `drawbox=x=${stripX - Math.round(stripSize * 0.35) - Math.round(S * 0.016)}:y=${stripY - Math.round(stripSize * 0.35)}:w=${Math.round(S * 0.014)}:h=${Math.round(stripSize * 1.45) + stripSub + Math.round(stripSub * 0.9) + Math.round(stripSize * 0.35)}:color=${hex(color)}@1:t=fill:${on}`,
      `drawtext=${head}text='${esc(name)}':fontsize=${stripSize}:fontcolor=0x24221e:box=1:boxcolor=white@0.95:boxborderw=${Math.round(stripSize * 0.35)}:x=${stripX}:y=${stripY}:${on}`,
      sub && `drawtext=${body}text='${esc(sub)}':fontsize=${stripSub}:fontcolor=0x4a463e:box=1:boxcolor=white@0.95:boxborderw=${Math.round(stripSub * 0.45)}:x=${stripX}:y=${stripY + Math.round(stripSize * 1.45)}:${on}`,
    ].filter(Boolean).join(",");

    const outPath = join(dir, "card.mp4");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inPath)
        .input(endPng).inputOptions(["-loop", "1", "-t", String(END_SECONDS)])
        .input("anullsrc=r=44100:cl=stereo").inputOptions(["-f", "lavfi", "-t", String(END_SECONDS)])
        .complexFilter([
          `[0:v]scale=${W}:${H},fps=30,setsar=1,format=yuv420p,${strip}[v0]`,
          `[1:v]scale=${W}:${H},fps=30,setsar=1,format=yuv420p,${endText},fade=t=in:st=0:d=0.4[v1]`,
          `[0:a]aresample=44100,aformat=channel_layouts=stereo[a0]`,
          `[2:a]aresample=44100,aformat=channel_layouts=stereo[a1]`,
          `[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
        ])
        .outputOptions(["-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"])
        .on("error", (err: Error) => reject(err))
        .on("end", () => resolve())
        .save(outPath);
    });
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
