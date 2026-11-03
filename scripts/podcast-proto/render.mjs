// Prototype, step 2: renders each speaker over their own full-length track,
// background removed, so each is on camera the whole episode (talking on
// their lines, listening otherwise). Tries a see-through WebM first, then a
// green backdrop to key out.
//
//   node scripts/podcast-proto/render.mjs <out-dir> <hostLookId>
import fs from "fs";
import path from "path";

const [out, hostLook] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.HEYGEN_API_KEY, SUPA = env.NEXT_PUBLIC_SUPABASE_URL, SKEY = env.SUPABASE_SERVICE_ROLE_KEY;
const API = "https://api.heygen.com";
const guest = JSON.parse(fs.readFileSync(path.join(out, "guest.json"), "utf8"));

async function upload(file, name) {
  const p = `podcast-proto/${name}`;
  const r = await fetch(`${SUPA}/storage/v1/object/assets/${p}`, {
    method: "POST", headers: { Authorization: `Bearer ${SKEY}`, "Content-Type": "audio/mpeg", "x-upsert": "true" }, body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`upload ${r.status} ${await r.text()}`);
  return `${SUPA}/storage/v1/object/public/assets/${p}`;
}
async function submit(lookId, audioUrl, mode) {
  const body = {
    type: "avatar", avatar_id: lookId, audio_url: audioUrl, title: "Podcast prototype",
    aspect_ratio: "16:9", resolution: "1080p", engine: { type: "avatar_iii" },
    ...(mode === "webm" ? { output_format: "webm" } : { remove_background: true, background: { type: "color", value: "#00FF00" } }),
  };
  const r = await fetch(`${API}/v3/videos`, { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${mode} ${r.status}: ${t.slice(0, 250)}`);
  return JSON.parse(t).data.video_id;
}
async function wait(id) {
  for (let i = 0; i < 180; i++) {
    const d = (await (await fetch(`${API}/v3/videos/${id}`, { headers: { "x-api-key": KEY } })).json()).data ?? {};
    if (d.status === "completed") return d;
    if (d.status === "failed") throw new Error(`failed: ${JSON.stringify(d.failure_message ?? d.error ?? d).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("over 30 minutes");
}

await Promise.all([["host", hostLook], ["guest", guest.lookId]].map(async ([who, look]) => {
  const url = await upload(path.join(out, `track-${who}.mp3`), `track-${who}.mp3`);
  let id, mode = "webm";
  try { id = await submit(look, url, "webm"); }
  catch (e) { console.log(who, "see-through refused, using green:", e.message.slice(0, 160)); mode = "green"; id = await submit(look, url, "green"); }
  console.log(who, mode, "rendering", id);
  let d;
  try { d = await wait(id); }
  catch (e) {
    if (mode !== "webm") throw e;
    console.log(who, "see-through failed, using green:", e.message.slice(0, 160));
    mode = "green"; id = await submit(look, url, "green"); d = await wait(id);
  }
  const file = path.join(out, `${who}.${mode === "webm" ? "webm" : "mp4"}`);
  fs.writeFileSync(file, Buffer.from(await (await fetch(d.video_url)).arrayBuffer()));
  console.log(who, "done", mode, d.duration, file);
}));
