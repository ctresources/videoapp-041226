// Runs the template finishing step locally on a sample talking video.
//   node scripts/templates/compose-test.mjs <avatar.mp4> <out-dir> <design> <shape>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const [avatar, out, design = "just_listed", shape = "vertical"] = process.argv.slice(2);
const root = path.resolve(".");
const jiti = createRequire(import.meta.url)("jiti")(path.join(root, "x.js"), { alias: { "@": root }, interopDefault: true });
const d = jiti(path.join(root, "lib/templates/designs.ts"));
const c = jiti(path.join(root, "lib/templates/compose.ts"));
const work = path.resolve(out, `${design}-${shape}`);
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const urls = ["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1280&q=70", "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1280&q=70", "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1280&q=70"];
const photos = [];
for (const [i, u] of urls.entries()) { const f = path.join(work, `p${i}.jpg`); fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer())); photos.push(f); }
const fields = { headline: "JUST LISTED", address: "42 Maple Lane, Springfield", price: "$749,000", details: "3 beds · 2.5 baths · 2,140 sq ft", agent: "Carmella Thompson · (610) 555-0100" };
const { png, circle } = await d.wordsLayer(design, shape, fields);
const t0 = Date.now();
const clean = await c.composeClean({ workDir: work, shape, circle, avatar: path.resolve(avatar), photos, threads: 1 });
const final = await c.addWords({ workDir: work, clean, words: png, threads: 1 });
console.log("done in", Math.round((Date.now() - t0) / 1000), "s →", final);
