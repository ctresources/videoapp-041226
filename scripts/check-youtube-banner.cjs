/** End-to-end template/export checks. Run: node scripts/check-youtube-banner.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Load app TypeScript/aliases without adding a test runner or build step.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};

async function main() {
  const sharp = require("sharp");
  const opentype = require("opentype.js");
  const { PDFDocument } = require("pdf-lib");
  const { renderBanner } = require("../lib/utils/banner-render.ts");
  const { sceneToPdf } = require("../lib/utils/banner-pdf.ts");
  const { BANNER_BLOCKS } = require("../lib/utils/banner-layout.ts");
  const { YOUTUBE_BANNER, YOUTUBE_SAFE_ZONE_STYLE } = require("../lib/utils/youtube-banner.ts");
  assert.deepEqual(YOUTUBE_BANNER, { width: 2560, height: 1440, safe: { x: 507, y: 508.5, width: 1546, height: 423 } });
  assert.equal(parseFloat(YOUTUBE_SAFE_ZONE_STYLE.width) / 100 * 2560, 1546);
  const fontBytes = fs.readFileSync(path.join(process.cwd(), "fonts/ArchivoBlack-Regular.ttf"));
  const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
  const fixture = await sharp(Buffer.from('<svg width="600" height="100"><rect width="600" height="100" fill="#0e7490"/><rect width="20" height="100" fill="#f59e0b"/><rect x="580" width="20" height="100" fill="#f59e0b"/></svg>')).png().toBuffer();
  const originalFetch = global.fetch;
  global.fetch = async url => new Response(fixture, { status: String(url).includes("missing") ? 404 : 200 });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "sparkreels-youtube-"));
  const full = {
    userId: "test", headline: "YOUR LOCAL REAL ESTATE GUIDE",
    subscribeKicker: "NEW VIDEOS EVERY WEEK!", subscribeMain: "SUBSCRIBE",
    subscribeSub: "BLUE BELL & THE PHILADELPHIA SUBURBS",
    extraLine1: "YOUR NAME · YOUR BROKERAGE", extraLine2: "example.com · (555) 123-4567",
    photoUrls: ["https://fixture.test/photo1", "https://fixture.test/photo2"],
    logoUrl: "https://fixture.test/logo", qr1Link: "https://example.com/chat", qr2Link: "https://example.com/book",
  };
  const cases = [
    ["default", { userId: "test" }],
    ["complete", full],
    ["extreme-up", { ...full, layout: Object.fromEntries(BANNER_BLOCKS.map(k => [k, { size: "l", align: "right", dy: -99999 }])) }],
    ["extreme-down", { ...full, layout: Object.fromEntries(BANNER_BLOCKS.map(k => [k, { size: "s", align: "center", dy: 99999 }])) }],
    ["long-input", { ...full, headline: "W".repeat(200), extraLine2: "email-address-".repeat(15) + "@example.com", qr1Caption: "SCAN THIS LONG CAPTION TO GET HELP FINDING YOUR NEXT HOME IN OUR LOCAL MARKET" }],
    ["hidden", { ...full, layout: Object.fromEntries(BANNER_BLOCKS.map(k => [k, { hidden: true }])) }],
    ["missing-assets", { ...full, photoUrls: ["https://fixture.test/missing"], logoUrl: "https://fixture.test/missing" }],
  ];
  try {
    for (const [name, options] of cases) {
      const { png, scene } = await renderBanner(options);
      const meta = await sharp(png).metadata();
      assert.equal(meta.width, 2560); assert.equal(meta.height, 1440);
      const inside = b => {
        for (const n of Object.values(b)) assert.ok(Number.isFinite(n));
        assert.ok(b.x >= 507 && b.y >= 508.5 && b.x + b.w <= 2053 && b.y + b.h <= 931.5, `${name}: escaped safe zone ${JSON.stringify(b)}`);
      };
      for (const t of scene.texts) {
        const b = font.getPath(t.text, t.x, t.baseline, t.size).getBoundingBox();
        inside({ x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 });
      }
      scene.images.forEach(i => inside({ x: i.x, y: i.y, w: i.w, h: i.h }));
      // Check actual PNG pixels, not only recorded geometry: outer canvas
      // must be precisely the background, with no leaked text or images.
      const bg = await sharp(scene.bgPng).ensureAlpha().raw().toBuffer();
      const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
      for (let y = 0; y < 1440; y++) {
        if (y >= 508 && y < 932) {
          assert.ok(pixels.subarray(y * 2560 * 4, (y * 2560 + 507) * 4).equals(bg.subarray(y * 2560 * 4, (y * 2560 + 507) * 4)));
          assert.ok(pixels.subarray((y * 2560 + 2053) * 4, (y + 1) * 2560 * 4).equals(bg.subarray((y * 2560 + 2053) * 4, (y + 1) * 2560 * 4)));
        } else assert.ok(pixels.subarray(y * 2560 * 4, (y + 1) * 2560 * 4).equals(bg.subarray(y * 2560 * 4, (y + 1) * 2560 * 4)));
      }
      if (name === "complete" || name === "default") {
        fs.writeFileSync(path.join(output, `${name}.png`), png);
        const crop = await sharp(png).extract({ left: 507, top: 509, width: 1546, height: 422 }).png().toBuffer();
        fs.writeFileSync(path.join(output, `${name}-mobile.png`), crop);
      }
      if (name === "complete") {
        assert.equal(scene.images.length, 5, "two photos, logo and two QR codes survive");
        const logo = scene.images[2];
        const { info: lm } = await sharp(logo.png).trim().toBuffer({ resolveWithObject: true });
        assert.ok(Math.abs(lm.width / lm.height - 6) < 0.15, "wide logo keeps its aspect ratio without cropping");
        const pdf = await sceneToPdf(scene, "YouTube banner safe-zone check");
        const doc = await PDFDocument.load(pdf);
        assert.deepEqual(doc.getPage(0).getSize(), { width: 2560, height: 1440 });
        fs.writeFileSync(path.join(output, "complete.pdf"), pdf);
      }
      if (name === "hidden") assert.equal(scene.images.length + scene.texts.length, 0);
      console.log(`ok ${name}: PNG and foreground bounds`);
    }
  } finally { global.fetch = originalFetch; }
  console.log(`Preview fixtures: ${output}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
