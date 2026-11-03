// Makes all five designs, both shapes, with animated words, over a sample
// talking video: the app's own compose + HyperFrames steps, run locally.
//   node scripts/templates/animated-test.mjs <avatar.mp4> <out-dir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const [avatar, outDir] = process.argv.slice(2);
const root = path.resolve(".");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
process.env.HEYGEN_API_KEY = env.HEYGEN_API_KEY;
const jiti = createRequire(import.meta.url)("jiti")(path.join(root, "x.js"), { alias: { "@": root }, interopDefault: true });
const d = jiti(path.join(root, "lib/templates/designs.ts"));
const c = jiti(path.join(root, "lib/templates/compose.ts"));
const a = jiti(path.join(root, "lib/templates/animated.ts"));

const urls = ["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1280&q=70", "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1280&q=70"];
const place = "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1280&q=70";
const contact = { agent: "Carmella Thompson · SparkReels Realty", phones: "Mobile (610) 555-0100 · Office (610) 555-0199" };
const sample = {
  just_listed: { headline: "JUST LISTED", address: "42 Maple Lane, Springfield", price: "$749000", details: "3 beds · 2.5 baths · 2,140 sq ft", ...contact },
  luxury: { headline: "Luxury Listing", address: "18 Harbor View Drive", price: "Offered at $2,450,000", details: "5 beds · 6 baths · Waterfront", ...contact },
  market_update: { headline: "Market Update · November", title: "Springfield Housing Market", s1: "$412K", s1l: "Median price", s1c: "Up 4%", s2: "18", s2l: "Days on market", s2c: "Down 3 days", s3: "126", s3l: "Homes sold", s3c: "Up 9%", ...contact },
  neighborhood: { headline: "Neighborhood Spotlight", name: "Riverside", highlights: "Walkable, Top schools, Riverfront park", ...contact },
  agent_intro: { headline: "Meet your agent", name: "Carmella Thompson", role: "Your Springfield REALTOR® · SparkReels Realty", phones: contact.phones, website: "sparkreels.ai" },
};
const get = async (u, f) => { fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer())); return f; };
const jobs = [];
for (const shape of ["horizontal", "vertical"]) for (const des of d.DESIGNS) jobs.push({ shape, des });
await Promise.all([0, 1, 2].map(async () => {
  for (let j = jobs.shift(); j; j = jobs.shift()) {
    const { shape, des } = j;
    const work = path.resolve(outDir, `${des.id}-${shape}`);
    fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
    try {
      const photos = des.photos === "listing" ? await Promise.all(urls.map((u, i) => get(u, path.join(work, `p${i}.jpg`)))) : des.photos === "place" ? [await get(place, path.join(work, "place.jpg"))] : [];
      const still = des.photos === "none" ? path.join(work, "still.png") : null;
      if (still) fs.writeFileSync(still, await d.introBackground(shape));
      const { png, circle } = await d.wordsLayer(des.id, shape, sample[des.id]);
      const clean = await c.composeClean({ workDir: work, shape, circle, avatar: path.resolve(avatar), photos, still, threads: 1 });
      const secs = await c.secondsOf(clean);
      const project = a.animatedProject({ design: des.id, shape, fields: sample[des.id], accent: "#e7b84a", seconds: secs });
      const t0 = Date.now();
      const anim = await a.renderAnimatedWords(project, shape, `test-${des.id}-${shape}-${Date.now()}`);
      const tr = Math.round((Date.now() - t0) / 1000);
      await c.addWords({ workDir: work, clean, words: png, threads: 1, animated: anim });
      console.log(des.id, shape, anim ? `animated (render ${tr}s)` : "STILL (animation failed)");
    } catch (e) { console.log(des.id, shape, "ERROR", e.message.slice(0, 200)); }
  }
}));
console.log("all done");
