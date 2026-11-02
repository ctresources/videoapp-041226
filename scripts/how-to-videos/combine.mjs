// Puts one how-to video together: the screen recording, the Digital Twin in a
// gold-ringed circle bottom right (its voice is the narration), and captions.
//
//   node scripts/how-to-videos/combine.mjs <out-dir> <id>
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const [outDir, id] = process.argv.slice(2);
const { raw, offset, duration } = JSON.parse(fs.readFileSync(path.join(outDir, `${id}-timing.json`), "utf8"));
const twin = `${id}-twin.mp4`;
// Bottom LEFT, over the menu's account corner: bottom right covers Next.
const D = 220;          // circle size
const R = D / 2;
const RING = 6;         // gold ring width
const out = `${id}.mp4`;

// The twin is framed square; take the face area, then cut it to a circle.
// (Her twin is filmed wide, letterboxed into the square: face at about 345,300.)
const crop = process.env.TWIN_CROP || "300:300:195:160";
const filter = [
  `[0:v]trim=start=${offset.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=1280:720[scr]`,
  `[1:v]crop=${crop},scale=${D}:${D},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${R},Y-${R}),${R}),255,0)'[face]`,
  `color=c=0xE7A92C:s=${D + 2 * RING}x${D + 2 * RING}:d=${Math.ceil(duration + 2)},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${R + RING},Y-${R + RING}),${R + RING}),255,0)'[ring]`,
  `[scr][ring]overlay=24:H-h-24:shortest=1[s1]`,
  `[s1][face]overlay=${24 + RING}:H-h-${24 + RING}:shortest=1[s2]`,
  // Caption sizes are in the subtitle's own 384x288 units (x3.33 on 1280x720);
  // the left margin keeps them clear of the circle.
  `[s2]subtitles=${id}.srt:force_style='FontName=Arial,Fontsize=11,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H99000000,BorderStyle=4,Outline=2,Shadow=0,MarginV=10,MarginL=85,MarginR=15'[v]`,
].join(";");

execFileSync(ffmpegPath.path, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", raw, "-i", twin,
  "-filter_complex", filter,
  "-map", "[v]", "-map", "1:a",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
  "-t", (duration + 0.6).toFixed(2),
  out,
], { cwd: outDir, stdio: "inherit" });
console.log(id, "→", path.join(outDir, out));
