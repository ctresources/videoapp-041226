// Tries the template background (whole-over-blur, slow zoom, fades) on a wide
// and a tall photo, both shapes, one processor like the server, and times it.
//   node scripts/templates/photos-test.mjs <avatar.mp4> <out-dir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const [avatar, outDir] = process.argv.slice(2);
const root = path.resolve(".");
// The test runner hands back sharp without the .default the app's build adds.
const sharpMod = createRequire(import.meta.url)("sharp"); sharpMod.default = sharpMod;
const jiti = createRequire(import.meta.url)("jiti")(path.join(root, "x.js"), { alias: { "@": root }, interopDefault: true });
const d = jiti(path.join(root, "lib/templates/designs.ts"));
const c = jiti(path.join(root, "lib/templates/compose.ts"));
const urls = [
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=70", // wide house
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&h=1400&fit=crop&q=70", // tall
  "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1600&q=70", // wide kitchen
];
for (const shape of ["horizontal", "vertical"]) {
  const work = path.resolve(outDir, `photos-${shape}`);
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const photos = [];
  for (const [i, u] of urls.entries()) { const f = path.join(work, `p${i}.jpg`); fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer())); photos.push(f); }
  const { circle } = await d.wordsLayer("just_listed", shape, { headline: "JUST LISTED", address: "42 Maple Lane", price: "$749000", details: "3 beds" });
  const t0 = Date.now();
  await c.composeClean({ workDir: work, shape, circle, avatar: path.resolve(avatar), photos, threads: 1 });
  console.log(shape, "clean in", Math.round((Date.now() - t0) / 1000), "s; video", Math.round(await c.secondsOf(path.join(work, "clean.mp4"))), "s");
}
