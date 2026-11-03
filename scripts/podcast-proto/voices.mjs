// Prototype, step 1: each line of the conversation in its speaker's voice,
// then one track per speaker for the whole episode (silence while the other
// talks), the combined track, and the timeline.
//
//   node scripts/podcast-proto/voices.mjs <script.json> <out-dir> <hostVoiceId> <guestName>
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const [scriptFile, out, hostVoice, guestName] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.HEYGEN_API_KEY;
const API = "https://api.heygen.com";
const ff = (args) => execFileSync(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
fs.mkdirSync(out, { recursive: true });
const convo = JSON.parse(fs.readFileSync(scriptFile, "utf8"));

// The co-host: the first public studio look with this name, and its voice.
let guest = fs.existsSync(path.join(out, "guest.json")) ? JSON.parse(fs.readFileSync(path.join(out, "guest.json"), "utf8")) : null;
for (let token, page = 0; !guest && page < 8; page++) {
  const q = new URLSearchParams({ ownership: "public", avatar_type: "studio_avatar", limit: "50", ...(token ? { token } : {}) });
  const d = await (await fetch(`${API}/v3/avatars/looks?${q}`, { headers: { "x-api-key": KEY } })).json();
  const hit = (d.data ?? []).find((l) => l.name?.toLowerCase().startsWith(guestName.toLowerCase()) && l.default_voice_id
    && (!l.preferred_orientation || l.preferred_orientation === "landscape"));
  if (hit) guest = { lookId: hit.id, voiceId: hit.default_voice_id, name: hit.name };
  token = d.has_more ? d.next_token : null;
  if (!token) break;
}
if (!guest) throw new Error(`No co-host named ${guestName}`);
fs.writeFileSync(path.join(out, "guest.json"), JSON.stringify(guest));
console.log("co-host:", guest.name);

const dur = (f) => { try { execFileSync(ffmpegPath.path, ["-hide_banner", "-i", f], { stdio: "pipe" }); } catch (e) { const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; } return 0; };
const GAP = 0.35;
const timeline = [];
let t = 0.4;
for (const [i, turn] of convo.turns.entries()) {
  const f = path.join(out, `line-${String(i).padStart(2, "0")}.mp3`);
  let words = [];
  const wf = f.replace(".mp3", ".json");
  if (!fs.existsSync(f)) {
    const res = await fetch(`${API}/v3/voices/speech`, {
      method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: turn.text, voice_id: turn.speaker === "host" ? hostVoice : guest.voiceId }),
    });
    const body = await res.json();
    if (!res.ok || !body.data?.audio_url) throw new Error(`speech ${i}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    fs.writeFileSync(f, Buffer.from(await (await fetch(body.data.audio_url)).arrayBuffer()));
    fs.writeFileSync(wf, JSON.stringify((body.data.word_timestamps ?? []).filter((w) => w.word && !/^<.*>$/.test(w.word.trim()))));
    await new Promise((r) => setTimeout(r, 2500)); // the speech limit is 30 a minute
  }
  words = JSON.parse(fs.readFileSync(wf, "utf8"));
  const d = dur(f);
  timeline.push({ i, speaker: turn.speaker, text: turn.text, start: t, end: t + d, file: f, words });
  t += d + GAP;
}
const total = t + 0.6;
fs.writeFileSync(path.join(out, "timeline.json"), JSON.stringify({ total, turns: timeline }, null, 1));

// One track per speaker: their lines at their times, silence elsewhere.
// (Built by joining lines and silences: the bundled ffmpeg is too old for amix normalize.)
const silence = (d) => `aevalsrc=0|0:s=48000:d=${Math.max(0.01, d).toFixed(3)}`;
for (const who of ["host", "guest", "all"]) {
  const inputs = [];
  const parts = [];
  let at = 0;
  for (const x of timeline) {
    parts.push(silence(x.start - at));
    if (who === "all" || x.speaker === who) {
      inputs.push("-i", x.file);
      parts.push(`[${inputs.length / 2 - 1}:a]aresample=48000,aformat=channel_layouts=stereo`);
    } else parts.push(silence(x.end - x.start));
    at = x.end;
  }
  parts.push(silence(total - at));
  const labelled = parts.map((p, k) => `${p}[p${k}]`);
  const graph = `${labelled.join(";")};${parts.map((_, k) => `[p${k}]`).join("")}concat=n=${parts.length}:v=0:a=1[o]`;
  ff([...inputs, "-filter_complex", graph, "-map", "[o]", "-b:a", "192k", path.join(out, `track-${who}.mp3`)]);
}
console.log(`timeline ${total.toFixed(1)}s, ${timeline.length} lines; tracks written`);
