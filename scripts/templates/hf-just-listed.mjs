// Writes an animated Just Listed words layer as a HyperFrames project folder
// (index.html + fonts + GSAP), see-through so it can sit over the video.
// The words are written straight into the page (no variables needed).
//   node scripts/templates/hf-just-listed.mjs <out-dir> <seconds>
import fs from "fs";
import path from "path";

const [out, secs = "14"] = process.argv.slice(2);
const T = Number(secs);
fs.mkdirSync(out, { recursive: true });
for (const f of ["ArchivoBlack-Regular.ttf", "Montserrat-SemiBold.ttf"]) fs.copyFileSync(path.join("fonts", f), path.join(out, f));
const gsap = await (await fetch("https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js")).text();
fs.writeFileSync(path.join(out, "gsap.min.js"), gsap);

const w = {
  headline: "JUST LISTED", address: "42 Maple Lane, Springfield", price: "$749,000",
  details: "3 beds · 2.5 baths · 2,140 sq ft", agent: "Carmella Thompson · SparkReels Realty", phones: "Mobile (610) 555-0100 · Office (610) 555-0199",
};
const accent = "#e7b84a";
// Same layout as the still version (lib/templates/designs.ts), at 1920x1080.
const W = 1920, H = 1080;
const circle = { cx: W * 0.135, cy: H - W * 0.03 - W * 0.095, d: W * 0.19 };
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face { font-family: "Archivo Black"; src: url("ArchivoBlack-Regular.ttf"); }
  @font-face { font-family: "Montserrat"; font-weight: 600; src: url("Montserrat-SemiBold.ttf"); }
  html, body { margin: 0; padding: 0; background: transparent; width: ${W}px; height: ${H}px; overflow: hidden; }
  #stage { position: relative; width: ${W}px; height: ${H}px; background: transparent; }
  .fade { position: absolute; left: 0; right: 0; top: ${H * 0.56}px; bottom: 0;
    background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.72) 45%, rgba(0,0,0,.86)); }
  .label { position: absolute; left: ${W * 0.05}px; top: ${H * 0.07}px; background: ${accent}; color: #14100a;
    font: 69px "Archivo Black"; letter-spacing: 3px; padding: 14px 34px 10px; border-radius: 12px; overflow: hidden; }
  .addr { position: absolute; left: ${W * 0.27}px; top: ${H * 0.79 - 72}px; color: #fff; font: 78px "Archivo Black"; white-space: nowrap; }
  .price { position: absolute; left: ${W * 0.27}px; top: ${H * 0.895 - 98}px; color: ${accent}; font: 104px "Archivo Black"; transform-origin: left center; white-space: nowrap; }
  .details { position: absolute; left: ${W * 0.27}px; top: ${H * 0.955 - 34}px; color: #f1ece2; font: 600 38px "Montserrat"; white-space: nowrap; }
  .contact { position: absolute; right: ${W * 0.04}px; top: ${H * 0.918 - 30}px; text-align: right; font-family: "Montserrat"; font-weight: 600; }
  .contact .a { color: #fff; font-size: 30px; } .contact .p { color: #e6dfd2; font-size: 26px; margin-top: 8px; }
  svg.ring { position: absolute; left: 0; top: 0; }
  .shine { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.55) 50%, transparent 60%); mix-blend-mode: overlay; transform: translateX(-120%); }
</style></head>
<body>
<div id="stage" data-composition-id="justlisted" data-start="0" data-duration="${T}" data-width="${W}" data-height="${H}">
  <div id="layer" class="clip" data-start="0" data-duration="${T}" data-track-index="0" style="position:absolute;inset:0">
    <div class="fade" id="fade"></div>
    <div class="label" id="label">${esc(w.headline)}<div class="shine" id="shine"></div></div>
    <svg class="ring" width="${W}" height="${H}"><circle id="ring" cx="${circle.cx}" cy="${circle.cy}" r="${circle.d / 2 + 6}" fill="none" stroke="${accent}" stroke-width="12"
      stroke-dasharray="${Math.PI * (circle.d + 12)}" stroke-dashoffset="${Math.PI * (circle.d + 12)}" transform="rotate(-90 ${circle.cx} ${circle.cy})"/></svg>
    <div class="addr" id="addr">${esc(w.address)}</div>
    <div class="price" id="price">${esc(w.price)}</div>
    <div class="details" id="details">${esc(w.details)}</div>
    <div class="contact" id="contact"><div class="a">${esc(w.agent)}</div><div class="p">${esc(w.phones)}</div></div>
  </div>
</div>
<script src="gsap.min.js"></script>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.from("#fade", { opacity: 0, duration: 0.8 }, 0.1)
    .from("#label", { x: -80, opacity: 0, duration: 0.7, ease: "back.out(1.6)" }, 0.2)
    .to("#shine", { x: "120%", duration: 0.9, ease: "power2.inOut" }, 0.9)
    .to("#ring", { attr: { "stroke-dashoffset": 0 }, duration: 1.1, ease: "power2.out" }, 0.3)
    .from("#addr", { y: 40, opacity: 0, duration: 0.7, ease: "power3.out" }, 0.9)
    .from("#price", { scale: 0.6, opacity: 0, duration: 0.6, ease: "back.out(2.2)" }, 1.4)
    .from("#details", { y: 20, opacity: 0, duration: 0.6 }, 1.9)
    .from("#contact", { x: 40, opacity: 0, duration: 0.7, ease: "power2.out" }, 2.2)
    // A gentle second pulse on the price halfway through, and the label shines again near the end.
    .to("#price", { scale: 1.06, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${Math.max(4, T / 2).toFixed(2)})
    .fromTo("#shine", { x: "-120%" }, { x: "120%", duration: 0.9, ease: "power2.inOut" }, ${Math.max(5, T - 3).toFixed(2)})
    .to({}, { duration: 0.01 }, ${T - 0.01});
  window.__timelines = window.__timelines || {};
  window.__timelines.justlisted = tl;
</script>
</body></html>`;
fs.writeFileSync(path.join(out, "index.html"), html);
console.log("written", out);
