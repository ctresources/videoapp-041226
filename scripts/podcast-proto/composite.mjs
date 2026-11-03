// Prototype, step 3: both speakers on the studio set. Three shots — wide (side
// by side), close on the host, close on the guest — cut on each line, with the
// combined voice track and captions.
//
//   node scripts/podcast-proto/composite.mjs <out-dir> <set-image-url>
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const [out, setUrl] = process.argv.slice(2);
const W = 1280, H = 720;
const { total, turns } = JSON.parse(fs.readFileSync(path.join(out, "timeline.json"), "utf8"));
const setFile = path.join(out, "set.png");
if (!fs.existsSync(setFile)) fs.writeFileSync(setFile, Buffer.from(await (await fetch(setUrl)).arrayBuffer()));

// Each speaker's layer: a see-through WebM, or a green backdrop keyed out.
const layer = (who) => {
  const webm = path.join(out, `${who}.webm`);
  if (fs.existsSync(webm)) return { input: ["-c:v", "libvpx-vp9", "-i", webm], key: "format=rgba" };
  return { input: ["-i", path.join(out, `${who}.mp4`)], key: "colorkey=0x00FF00:0.32:0.08,format=rgba" };
};
const host = layer("host"), guest = layer("guest");

// Which shot each line gets: wide to open and close, and every third line.
const shots = turns.map((t, i) => (i === 0 || i === turns.length - 1 || i % 3 === 0 ? "wide" : t.speaker));
const cuts = turns.map((t, i) => ({ shot: shots[i], from: i === 0 ? 0 : Math.max(0, t.start - 0.12), to: i + 1 < turns.length ? Math.max(0, turns[i + 1].start - 0.12) : total }));

// Captions from each line's word timings.
const fmt = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",");
let n = 0;
const srt = turns.flatMap((t) => {
  const words = t.words.length ? t.words : t.text.split(/\s+/).map((w, i, a) => ({ word: w, start: ((t.end - t.start) * i) / a.length, end: ((t.end - t.start) * (i + 1)) / a.length }));
  const chunks = [];
  for (let i = 0; i < words.length; i += 6) chunks.push(words.slice(i, i + 6));
  return chunks.map((c) => `${++n}\n${fmt(t.start + c[0].start)} --> ${fmt(t.start + c.at(-1).end)}\n${c.map((w) => w.word).join(" ")}`);
}).join("\n\n");
fs.writeFileSync(path.join(out, "episode.srt"), srt);

// Layer placement. Each layer is a 16:9 frame with the person in the middle.
const wideS = 0.8, closeS = 1.18;
// Ready-made co-hosts are framed closer than a twin: shrink theirs to match.
const GS = Number(process.env.GUEST_SCALE ?? 0.76);
const gwW = Math.round(W * wideS * GS), gwH = Math.round(H * wideS * GS), gcW = Math.round(W * closeS * GS), gcH = Math.round(H * closeS * GS);
const wW = Math.round(W * wideS), wH = Math.round(H * wideS);
const cW = Math.round(W * closeS), cH = Math.round(H * closeS);
// A desk across the bottom hides where each person ends, so the co-host can be
// lifted to the host's height.
const LIFT = Number(process.env.GUEST_LIFT ?? 75);
// Seated: both lower, behind a desk at elbow height.
const DROP = Number(process.env.DROP ?? 0), DROPC = Number(process.env.DROPC ?? 0);
const g = [
  `[4:v]scale=${W}:${H},format=rgba,split=3[dk1][dk2][dk3]`,
  `[0:v]scale=${W}:${H},setsar=1,trim=0:${total.toFixed(2)},fps=25,split=3[bgw][bgh][bgg]`,
  `[1:v]${host.key},fps=25,split=2[h1][h2]`,
  `[2:v]${guest.key},fps=25,split=2[g1][g2]`,
  `[h1]scale=${wW}:${wH}[hw]`, `[g1]scale=${gwW}:${gwH}[gw]`,
  `[h2]scale=${cW}:${cH}[hc]`, `[g2]scale=${gcW}:${gcH}[gc]`,
  // Wide: host left, guest right, standing on the same floor line.
  `[bgw][hw]overlay=${Math.round(W * 0.3 - wW / 2)}:${H - wH + DROP}:shortest=1[w1]`,
  `[w1][gw]overlay=${Math.round(W * 0.7 - gwW / 2)}:${H - gwH - LIFT + DROP}:shortest=1[w2];[w2][dk1]overlay=0:0,split=${cuts.filter((c) => c.shot === "wide").length || 1}${cuts.filter((c) => c.shot === "wide").map((_, k) => `[W${k}]`).join("") || "[W0]"}`,
  // Close-ups: the set softened behind, the speaker larger.
  `[bgh]boxblur=6:1[bh]`, `[bh][hc]overlay=${Math.round((W - cW) / 2)}:${H - cH + 100 + DROPC}:shortest=1[hx];[hx][dk2]overlay=0:0,split=${cuts.filter((c) => c.shot === "host").length || 1}${cuts.filter((c) => c.shot === "host").map((_, k) => `[H${k}]`).join("") || "[H0]"}`,
  `[bgg]boxblur=6:1[bg2]`, `[bg2][gc]overlay=${Math.round((W - gcW) / 2)}:${H - gcH - LIFT + DROPC}:shortest=1[gx];[gx][dk3]overlay=0:0,split=${cuts.filter((c) => c.shot === "guest").length || 1}${cuts.filter((c) => c.shot === "guest").map((_, k) => `[G${k}]`).join("") || "[G0]"}`,
];
const used = { wide: 0, host: 0, guest: 0 };
const segs = cuts.map((c, i) => {
  const tag = { wide: "W", host: "H", guest: "G" }[c.shot] + used[c.shot]++;
  g.push(`[${tag}]trim=${c.from.toFixed(3)}:${c.to.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`);
  return `[s${i}]`;
});
g.push(`${segs.join("")}concat=n=${segs.length}:v=1:a=0,subtitles=episode.srt:force_style='FontName=Arial,Fontsize=13,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H99000000,BorderStyle=4,Outline=2,Shadow=0,MarginV=14'[v]`);

execFileSync(ffmpegPath.path, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-loop", "1", "-i", setFile, ...host.input, ...guest.input, "-i", path.join(out, "track-all.mp3"), "-loop", "1", "-i", path.join(out, "desk.png"),
  "-filter_complex", g.join(";"),
  "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", total.toFixed(2), "episode.mp4",
], { cwd: out, stdio: "inherit" });
console.log("shots:", shots.join(" "), "→", path.join(out, "episode.mp4"));
