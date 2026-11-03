// Sends a HyperFrames project zip to HeyGen, waits, and saves the result.
//   node scripts/templates/hf-render.mjs <project.zip> <out-file> [format=webm] [aspect=16:9]
import fs from "fs";

const [zip, out, format = "webm", aspect = "16:9"] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const H = { "x-api-key": env.HEYGEN_API_KEY, "Content-Type": "application/json" };
const t0 = Date.now();
const res = await fetch("https://api.heygen.com/v3/hyperframes/renders", {
  method: "POST", headers: H,
  body: JSON.stringify({
    project: { type: "base64", media_type: "application/zip", data: fs.readFileSync(zip).toString("base64") },
    format, resolution: "1080p", aspect_ratio: aspect, fps: 30, quality: "standard", title: "SparkReels animated words test",
  }),
});
const text = await res.text();
console.log("submit", res.status, text.slice(0, 300));
if (!res.ok) process.exit(1);
const id = JSON.parse(text).data.render_id;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const d = (await (await fetch(`https://api.heygen.com/v3/hyperframes/renders/${id}`, { headers: H })).json()).data ?? {};
  if (d.status === "completed") {
    fs.writeFileSync(out, Buffer.from(await (await fetch(d.video_url)).arrayBuffer()));
    console.log("done in", Math.round((Date.now() - t0) / 1000), "s", JSON.stringify({ duration: d.duration, keys: Object.keys(d) }));
    process.exit(0);
  }
  if (d.status === "failed") { console.log("failed", JSON.stringify(d).slice(0, 500)); process.exit(1); }
}
console.log("still rendering after 10 minutes", id);
