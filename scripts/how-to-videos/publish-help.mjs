// Puts the finished how-to videos where How It Works plays them from: each MP4
// in the public "videos" bucket (how-to/step-NN.mp4) and a still for each in
// "assets" (how-to/step-NN.jpg). Kept apart from My Sparks, so deleting a copy
// there never breaks the guide. Then writes lib/help/how-to-videos.ts.
//
//   node scripts/how-to-videos/publish-help.mjs <out-dir> <narration.json>...
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const [outDir, ...narrFiles] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const videos = narrFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8"))).sort((a, b) => a.step - b.step);

async function put(bucket, p, file, type) {
  const res = await fetch(`${SUPA}/storage/v1/object/${bucket}/${p}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": type, "x-upsert": "true", "cache-control": "max-age=3600" },
    body: fs.readFileSync(file),
  });
  if (!res.ok) throw new Error(`${bucket}/${p}: ${res.status} ${(await res.text()).slice(0, 150)}`);
  return `${SUPA}/storage/v1/object/public/${bucket}/${p}`;
}

const rows = [];
for (const v of videos) {
  const file = path.join(outDir, `${v.id}.mp4`);
  if (!fs.existsSync(file)) { console.log(v.id, "missing, skipped"); continue; }
  const nn = String(v.step).padStart(2, "0");
  const still = path.join(outDir, `${v.id}-poster.jpg`);
  execFileSync(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "4", "-i", file, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", still]);
  const probe = (() => { try { execFileSync(ffmpegPath.path, ["-i", file], { stdio: "pipe" }); } catch (e) { return String(e.stderr); } return ""; })();
  const [, h, m, s] = probe.match(/Duration: (\d+):(\d+):([\d.]+)/) ?? [0, 0, 0, 30];
  const secs = Math.round(+h * 3600 + +m * 60 + +s);
  const src = await put("videos", `how-to/step-${nn}.mp4`, file, "video/mp4");
  const poster = await put("assets", `how-to/step-${nn}.jpg`, still, "image/jpeg");
  rows.push({ step: v.step, title: v.title, src, poster, seconds: secs });
  console.log(`step ${nn} ${v.id} ${secs}s`);
}

const ts = `/**
 * The how-to video for each How It Works step (2026-11-01, the owner's ask):
 * the real screens on the demo account, her Digital Twin and cloned voice,
 * with captions. Made by scripts/how-to-videos (re-run it when a screen
 * changes); these files live in storage apart from My Sparks.
 */
export interface HowToVideo { step: number; title: string; src: string; poster: string; seconds: number }

export const HOW_TO_VIDEOS: Record<number, HowToVideo> = {
${rows.map((r) => `  ${r.step}: ${JSON.stringify(r)},`).join("\n")}
};
`;
fs.writeFileSync("lib/help/how-to-videos.ts", ts);
console.log("wrote lib/help/how-to-videos.ts with", rows.length, "videos");
