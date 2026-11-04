// Saves finished how-to videos to the demo account's My Sparks through the
// app's own save path (the one Record My Screen uses), so each gets its title,
// description and Share Kit written, and can be published from the app.
// Also copies each MP4, named by step, into a folder for marketing.
//
//   node scripts/how-to-videos/save.mjs <session.json> <out-dir> <copy-to-folder> <narration.json>...
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [session, outDir, folder, ...narrFiles] = process.argv.slice(2);
const BASE = process.env.HOWTO_BASE || "https://www.sparkreels.ai";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const videos = narrFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8"))).sort((a, b) => a.step - b.step);
fs.mkdirSync(folder, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: session });
const page = await context.newPage();
await page.goto(`${BASE}/create`, { waitUntil: "domcontentloaded" });
// The demo account's id. The save route refuses a path outside the signed-in
// account's own folder, so a wrong id fails safely.
const userId = process.env.HOWTO_USER_ID;
if (!userId) throw new Error("Set HOWTO_USER_ID to the signed-in account's id.");

for (const v of videos) {
  const file = path.join(outDir, `${v.id}.mp4`);
  if (!fs.existsSync(file)) { console.log(v.id, "no video yet, skipped"); continue; }
  const name = `SparkReels How-To ${String(v.step).padStart(2, "0")} - ${v.title.replace(/[\\/:*?"<>|—]+/g, "-").replace(/\s+/g, " ").trim()}.mp4`;
  fs.copyFileSync(file, path.join(folder, name));

  const storagePath = `camera-recordings/${userId}/howto-${v.id}.mp4`;
  const up = await fetch(`${SUPA}/storage/v1/object/assets/${storagePath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "video/mp4", "x-upsert": "true" },
    body: fs.readFileSync(file),
  });
  if (!up.ok) { console.log(v.id, "upload failed", up.status, (await up.text()).slice(0, 150)); continue; }
  const res = await context.request.post(`${BASE}/api/video/save-camera-recording`, {
    data: {
      storagePath, videoType: "youtube_16x9", screen: true,
      // A sub-section video (sections.json) is named for its section, not "How to …".
      title: (v.anchor ? `${v.title} — SparkReels How-To` : `How to ${v.title.replace(/ — .*$/, "")} in SparkReels`).slice(0, 100),
      script: v.scenes.map((s) => s.say ?? s).join(" "),
      idempotencyKey: `howto-${v.id}`,
    },
    timeout: 120_000,
  });
  console.log(v.id, "→", name, "| My Sparks:", res.status(), (await res.text()).slice(0, 120));
}
await browser.close();
