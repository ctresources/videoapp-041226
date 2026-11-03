// Renders all five designs in both shapes over a sample photo, with a grey
// stand-in for the agent's circle, into one contact sheet for checking.
//   node scripts/templates/preview-designs.mjs <out.png>
import { createRequire } from "module";
import path from "path";
import sharp from "sharp";

const root = path.resolve(".");
const jiti = createRequire(import.meta.url)("jiti")(path.join(root, "x.js"), { alias: { "@": root }, interopDefault: true });
const d = jiti(path.join(root, "lib/templates/designs.ts"));

const photos = {
  just_listed: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1280&q=70",
  luxury: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1280&q=70",
  market_update: "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1280&q=70",
  neighborhood: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1280&q=70",
};
const sample = {
  just_listed: { headline: "JUST LISTED", address: "42 Maple Lane, Springfield", price: "$749,000", details: "3 beds · 2.5 baths · 2,140 sq ft", agent: "Jane Smith · (555) 010-2030" },
  luxury: { headline: "Luxury Listing", address: "18 Harbor View Drive", price: "Offered at $2,450,000", details: "5 beds · 6 baths · Waterfront" },
  market_update: { headline: "Market Update · November", title: "Springfield Housing Market", s1: "$412K", s1l: "Median price", s1c: "Up 4%", s2: "18", s2l: "Days on market", s2c: "Down 3 days", s3: "126", s3l: "Homes sold", s3c: "Up 9%" },
  neighborhood: { headline: "Neighborhood Spotlight", name: "Riverside", highlights: "Walkable, Top schools, Riverfront park" },
  agent_intro: { headline: "Meet your agent", name: "Jane Smith", role: "Your Springfield REALTOR® · Smith Realty Group", phone: "(555) 010-2030", website: "janesmithhomes.com" },
};
const tiles = [];
for (const shape of ["horizontal", "vertical"]) {
  for (const des of d.DESIGNS) {
    const { w, h } = d.SIZE[shape];
    const bg = des.id === "agent_intro"
      ? await d.introBackground(shape)
      : await sharp(Buffer.from(await (await fetch(photos[des.id])).arrayBuffer())).resize(w, h, { fit: "cover" }).png().toBuffer();
    const { png, circle } = await d.wordsLayer(des.id, shape, sample[des.id]);
    const disc = await sharp({ create: { width: Math.round(circle.d), height: Math.round(circle.d), channels: 4, background: "#9a8f80" } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(circle.d)}" height="${Math.round(circle.d)}"><circle cx="${circle.d / 2}" cy="${circle.d / 2}" r="${circle.d / 2}" fill="#fff"/></svg>`), blend: "dest-in" }]).png().toBuffer();
    console.log(shape, des.id);
    const frame = await sharp(bg).composite([
      { input: disc, left: Math.round(circle.cx - circle.d / 2), top: Math.round(circle.cy - circle.d / 2) },
      { input: png, left: 0, top: 0 },
    ]).png().toBuffer().then((b) => sharp(b).resize(shape === "horizontal" ? 640 : 270).png().toBuffer());
    tiles.push({ input: frame, shape });
  }
}
// Horizontal row of 5 (640x360 each), then vertical row of 5 (270x480).
const W = 640 * 3 + 40, rowsH = 360 * 2 + 480 + 60;
const comp = [];
tiles.filter((t) => t.shape === "horizontal").forEach((t, i) => comp.push({ input: t.input, left: (i % 3) * 660, top: Math.floor(i / 3) * 380 }));
tiles.filter((t) => t.shape === "vertical").forEach((t, i) => comp.push({ input: t.input, left: i * 290, top: 780 }));
await sharp({ create: { width: W, height: rowsH, channels: 3, background: "#f6f3ec" } }).composite(comp).png().toFile(process.argv[2]);
console.log("ok");
