// Renders the Digital Twin speaking each video's narration in the cloned voice
// (square, for the corner circle), then saves the MP4 and its timed captions.
// Avatar III is the cheap twin engine (~$1/min); falls back to the default.
//
//   node scripts/how-to-videos/twin.mjs <narration.json> <out-dir> <lookId> <voiceId> [only-id]
import fs from "fs";
import path from "path";

const [file, outDir, lookId, voiceId, only] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.HEYGEN_API_KEY;
if (!KEY) throw new Error("No video API key in .env.local");
const API = "https://api.heygen.com";
const videos = JSON.parse(fs.readFileSync(file, "utf8")).filter((v) => !only || v.id === only)
  .map((v) => ({ ...v, text: v.text ?? v.scenes.map((s) => s.say ?? s).join(" ") }))
  // Already rendered: skip (each render costs).
  .filter((v) => !fs.existsSync(path.join(outDir, `${v.id}-twin.mp4`)));
fs.mkdirSync(outDir, { recursive: true });

async function submit(text, engine) {
  const res = await fetch(`${API}/v3/videos`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "avatar", avatar_id: lookId, voice_id: voiceId, script: text,
      title: "How-to narration", aspect_ratio: "1:1", resolution: "720p",
      ...(engine && { engine: { type: engine } }),
      caption: { file_format: "srt" },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`submit ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body).data.video_id;
}

async function waitFor(id) {
  for (let i = 0; i < 180; i++) {
    const res = await fetch(`${API}/v3/videos/${id}`, { headers: { "x-api-key": KEY } });
    const d = (await res.json()).data ?? {};
    if (d.status === "completed") return d;
    if (d.status === "failed") throw new Error(`render failed: ${JSON.stringify(d.failure_message ?? d.error ?? "").slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("render took over 30 minutes");
}

// Three at a time: the account allows 10 renders at once, shared with real
// customers' videos, so this never takes more than a few of those places.
const queue = [...videos];
const one = async (v) => {
  let id;
  try { id = await submit(v.text, "avatar_iii"); }
  catch (e) { console.log(v.id, "Avatar III refused, using default:", e.message.slice(0, 160)); id = await submit(v.text); }
  console.log(v.id, "rendering", id);
  const d = await waitFor(id);
  const mp4 = await fetch(d.video_url);
  fs.writeFileSync(path.join(outDir, `${v.id}-twin.mp4`), Buffer.from(await mp4.arrayBuffer()));
  const srtUrl = d.subtitle_url ?? d.caption_url;
  if (srtUrl) fs.writeFileSync(path.join(outDir, `${v.id}.srt`), await (await fetch(srtUrl)).text());
  console.log(v.id, "done", d.duration ?? "", srtUrl ? "with captions" : "NO captions");
};
await Promise.all([0, 1, 2].map(async () => {
  for (let v = queue.shift(); v; v = queue.shift()) {
    try { await one(v); } catch (e) { console.log(v.id, "FAILED:", e.message.slice(0, 200)); }
  }
}));
