// Records one how-to video's screen, doing each step's clicks at the moment the
// twin's narration reaches that sentence (timings from the twin's captions).
// Never presses anything that saves, posts, records or spends.
//
//   node scripts/how-to-videos/record.mjs <session.json> <narration.json> <out-dir> <id>
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [session, narrFile, outDir, id] = process.argv.slice(2);
const BASE = process.env.HOWTO_BASE || "https://www.sparkreels.ai";
const video = JSON.parse(fs.readFileSync(narrFile, "utf8")).find((v) => v.id === id);
if (!video) throw new Error(`No narration "${id}"`);

// ── When each sentence starts, from the twin's captions ─────────────────────
const toSec = (t) => { const [h, m, s] = t.replace(",", ".").split(":"); return +h * 3600 + +m * 60 + +s; };
// No captions yet (a free dry run before the twin is rendered): time each
// sentence at a speaking pace of about 2.6 words a second.
const srtPath = path.join(outDir, `${id}.srt`);
const DRY = !fs.existsSync(srtPath);
const fmt = (t) => new Date(t * 1000).toISOString().slice(11, 23).replace(".", ",");
let at = 0.3;
const srt = DRY
  ? video.scenes.map((s, i) => { const n = (s.say ?? s).split(/\s+/).length; const a = at; at += n / 2.6 + 0.3; return `${i + 1}\n${fmt(a)} --> ${fmt(at - 0.3)}\n${s.say ?? s}`; }).join("\n\n")
  : fs.readFileSync(srtPath, "utf8").replace(/\r/g, "");
const cues = srt.split(/\n\n+/).map((b) => b.split("\n")).filter((l) => l.length >= 3).map((l) => {
  const [a, z] = l[1].split(" --> ");
  return { start: toSec(a), end: toSec(z), text: l.slice(2).join(" ") };
});
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const words = []; // each caption word with an estimated start time
for (const c of cues) {
  const w = norm(c.text);
  w.forEach((x, i) => words.push({ w: x, t: c.start + ((c.end - c.start) * i) / Math.max(1, w.length) }));
}
const duration = cues.at(-1).end;
let k = 0;
const starts = video.scenes.map((s) => {
  const t = words[Math.min(k, words.length - 1)]?.t ?? 0;
  k += norm(s.say ?? s).length;
  return t;
});
console.log(id, "scene starts:", starts.map((s) => s.toFixed(1)).join(", "), "of", duration.toFixed(1));

// ── Browser with a visible cursor ───────────────────────────────────────────
const browser = await chromium.launch();
const vidDir = path.join(outDir, `${id}-raw`);
fs.rmSync(vidDir, { recursive: true, force: true });
const context = await browser.newContext({
  storageState: session, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
  recordVideo: { dir: vidDir, size: { width: 1280, height: 720 } },
});
await context.addInitScript(() => {
  const add = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "640px", top: "360px", zIndex: 2147483647, pointerEvents: "none", transition: "transform .12s" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 3 + "px"; c.style.top = e.clientY - 2 + "px"; }, true);
    addEventListener("mousedown", () => {
      c.style.transform = "scale(.8)";
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: parseFloat(c.style.left) - 14 + "px", top: parseFloat(c.style.top) - 14 + "px", width: "32px", height: "32px", borderRadius: "50%", border: "3px solid #e7a92c", zIndex: 2147483646, pointerEvents: "none", transition: "all .45s ease-out", opacity: "1" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => Object.assign(r.style, { transform: "scale(2)", opacity: "0" }));
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener("mouseup", () => { c.style.transform = ""; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
  // The private import address works like a password: never on camera.
  setInterval(() => {
    const walk = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (/@in\.sparkreels\.ai/i.test(n.textContent ?? "") && n.parentElement) n.parentElement.style.filter = "blur(7px)";
    }
    for (const i of document.querySelectorAll("input, textarea")) if (/@in\.sparkreels\.ai/i.test(i.value)) i.style.filter = "blur(7px)";
  }, 150);
});
const page = await context.newPage();
const t0 = Date.now();
let pos = { x: 640, y: 360 };

const pause = (ms) => page.waitForTimeout(ms);
async function moveTo(loc, opts = {}) {
  await loc.first().waitFor({ state: "visible", timeout: 4_000 });
  const b = await loc.first().boundingBox();
  if (!b) return;
  const x = b.x + b.width * (opts.fx ?? 0.5), y = b.y + b.height * (opts.fy ?? 0.5);
  await page.mouse.move(x, y, { steps: opts.steps ?? 28 });
  pos = { x, y };
}
async function click(loc) { await moveTo(loc); await pause(250); await page.mouse.down(); await pause(90); await page.mouse.up(); }
async function smoothScrollTo(loc, block = "start") {
  const h = await loc.first().elementHandle({ timeout: 4_000 });
  await h.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
  await pause(900);
}
async function smoothScrollBy(dy) { await page.evaluate((d) => scrollBy({ top: d, behavior: "smooth" }), dy); await pause(900); }
async function settle() { await page.waitForLoadState("networkidle").catch(() => {}); await pause(1500); }
const link = (name) => page.getByRole("link", { name, exact: true }).first();
const btn = (name, exact = true) => page.getByRole("button", { name, exact }).first();

// ── Each video's steps: [setup, scene 0, scene 1, …] ────────────────────────
const SCRIPTS = {
  voice: [
    async () => { await page.goto(`${BASE}/create`); await settle(); },
    async () => { await click(link("Settings")); await page.waitForURL(/\/settings/); await settle(); },
    async () => { await smoothScrollTo(page.locator("#voice")); await moveTo(page.locator("#voice"), { fy: 0.15 }); },
    async () => {
      await click(btn("Re-clone"));
      await pause(500);
      await smoothScrollTo(page.locator("#voice"), "start");
      await click(page.getByRole("tab", { name: /Record my voice/ }));
      await pause(400);
      const script = page.locator("#voice textarea");
      if (await script.count()) await moveTo(script, { fx: 0.3, fy: 0.4 });
    },
    async () => { await moveTo(btn(/Start recording/i, false)); },
    async () => { await page.mouse.move(pos.x + 60, pos.y + 4, { steps: 15 }); },
    async () => { await click(page.getByRole("tab", { name: /Upload a file/ })); },
    async () => { await moveTo(page.locator("#voice"), { fx: 0.5, fy: 0.2 }); },
  ],
  speak: [
    async () => { await page.goto(`${BASE}/create`); await settle(); },
    async () => { await moveTo(page.getByRole("heading", { name: "What do you want to create?" })); },
    async () => { await moveTo(btn("Tap the mic and say your topic")); await pause(1500); await moveTo(page.locator("#brief-box"), { fx: 0.3 }); },
    async (dur) => {
      const text = "Make a vertical video about why first-time buyers should get pre-approved in Springfield, Illinois";
      await click(page.locator("#brief-box"));
      // Each key has its own overhead, so aim to finish in about half the sentence.
      await page.keyboard.type(text, { delay: Math.max(6, Math.min(25, (dur * 1000 * 0.45) / text.length)) });
    },
    async () => {
      // The page fills itself in a few seconds after typing stops.
      const city = page.getByPlaceholder("Your city or area");
      for (let i = 0; i < 25 && !(await city.inputValue().catch(() => "")); i++) await pause(200);
      await smoothScrollTo(page.getByRole("button", { name: /Video \/ Reel/ }), "center");
      await moveTo(page.getByRole("button", { name: /Video \/ Reel/ }));
      await pause(1600);
      await moveTo(page.getByPlaceholder("Your city or area"));
      await pause(1400);
      await smoothScrollTo(page.getByRole("button", { name: /Vertical 9:16/ }), "center");
      await moveTo(page.getByRole("button", { name: /Vertical 9:16/ }));
    },
    async () => { await moveTo(btn(/Next/, false)); },
    async () => { await page.mouse.move(pos.x - 40, pos.y - 6, { steps: 12 }); },
  ],
  publish: [
    async () => { await page.goto(`${BASE}/home`); await settle(); },
    async () => { await click(link("My Sparks")); await page.waitForURL(/\/videos/); await settle(); },
    async () => {
      await smoothScrollTo(page.getByRole("heading", { name: /Videos — rendered/ }), "start");
      await moveTo(btn("Publish"));
      await pause(500);
      await click(btn("Publish"));
      await pause(1200);
    },
    async () => { await moveTo(page.getByText("Title", { exact: true }).first(), { fx: 2 }); },
    async () => { await moveTo(page.getByText(/^post to$/i).locator("xpath=following::button[1]")); await pause(1200); await moveTo(page.getByText("Connect an account", { exact: true })); },
    async () => { await moveTo(btn(/Post Now/, false)); await pause(1000); await moveTo(btn(/Schedule/, false)); },
    async () => {
      const privacy = page.getByText("Privacy", { exact: true }).locator("xpath=following::select[1]");
      await smoothScrollTo(privacy, "center");
      await moveTo(privacy);
      await pause(1800);
      const go = page.getByRole("button", { name: /^Publish to/ });
      await smoothScrollTo(go, "center");
      await moveTo(go); // hover only: never pressed
    },
    async () => {
      await page.mouse.move(pos.x, pos.y - 140, { steps: 15 });
      await page.keyboard.press("Escape");
      await pause(600);
    },
  ],
};

// ── Written moves (more.json): each scene's "do" list; in scene 0 the moves
// before "|" happen before the narration starts. ─────────────────────────────
// Never pressed, whatever a move says: anything that saves, sends, connects,
// buys, posts, trains, records or spends.
// (A bare "Publish" only opens the Publish window, so it is allowed.)
const NEVER = /spark video|publish to|delete|remove|disconnect|sign out|buy|get started|manage|train|approve|apply|save|update|generate|spark an image|import|^connect|request|new address|email this|make draft|skip|start recording|write my script|build|listen|copy|send|regenerate|retrain|upload|choose video/i;
function target(spec) {
  let loc = page;
  for (const part of spec.split(" >> ")) {
    const [kind, ...rest] = part.split(":");
    const v = rest.join(":");
    if (part.startsWith("nth=")) loc = loc.nth(+part.slice(4));
    else if (kind === "btn") loc = loc.getByRole("button", { name: v, exact: true });
    else if (kind === "btn~") loc = loc.getByRole("button", { name: new RegExp(v) });
    else if (kind === "h") loc = loc.getByRole("heading", { name: v, exact: true });
    else if (kind === "h~") loc = loc.getByRole("heading", { name: new RegExp(v) });
    else if (kind === "ph") loc = loc.getByPlaceholder(v, { exact: true });
    else if (kind === "text") loc = loc.getByText(v, { exact: true });
    else if (kind === "text~") loc = loc.getByText(v);
    else loc = loc.locator(part);
  }
  return loc;
}
async function firstVisible(loc) {
  const n = await loc.count();
  for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible()) return loc.nth(i);
  await loc.first().waitFor({ state: "visible", timeout: 4_000 });
  return loc.first();
}
async function run(a) {
  if (a === "|") return;
  if (a.go) { await page.goto(BASE + a.go); await settle(); return; }
  if (a.wait) { await pause(a.wait); return; }
  if (a.nav) {
    const before = page.url();
    await click(link(a.nav));
    await page.waitForURL((u) => u.toString() !== before, { timeout: 10_000 }).catch(() => {});
    await settle();
    return;
  }
  if (a.stab) { await pause(800); await click(page.locator(`a[href="${a.stab}"]`)); await page.waitForURL(new RegExp(a.stab.replace(/\//g, "\\/"))); await settle(); return; }
  if (a.scroll) { await smoothScrollTo(await firstVisible(target(a.scroll)).catch(() => target(a.scroll)), a.block ?? "start"); return; }
  if (a.hover) { await moveTo(await firstVisible(target(a.hover)), a); return; }
  if (a.click) {
    const t = await firstVisible(target(a.click));
    const label = ((await t.innerText().catch(() => "")) || (await t.getAttribute("aria-label")) || "").trim();
    if (NEVER.test(label)) { console.log(`refused to press "${label}"`); await moveTo(t); return; }
    await click(t); await pause(500); return;
  }
  if (a.type) {
    const t = await firstVisible(target(a.into));
    await click(t);
    await page.keyboard.type(a.type, { delay: a.delay ?? 22 });
    return;
  }
  throw new Error(`unknown move ${JSON.stringify(a)}`);
}
function written() {
  const s0 = video.scenes[0].do ?? [];
  const cut = s0.indexOf("|");
  const setup = cut >= 0 ? s0.slice(0, cut) : [];
  const first = cut >= 0 ? s0.slice(cut + 1) : s0;
  const each = (list) => async () => { for (const a of list) { try { await run(a); } catch (e) { console.log(`${id}: ${JSON.stringify(a).slice(0, 80)} → ${e.message.split("\n")[0]}`); } } };
  return [each(setup), each(first), ...video.scenes.slice(1).map((s) => each(s.do ?? []))];
}

const steps = video.scenes[0].do ? written() : SCRIPTS[id];
await steps[0]();
const narrAt = Date.now();
for (let i = 0; i < video.scenes.length; i++) {
  const wait = narrAt + starts[i] * 1000 - Date.now();
  if (wait > 0) await pause(wait);
  const dur = (i + 1 < starts.length ? starts[i + 1] : duration) - starts[i];
  try { await steps[i + 1](dur); }
  catch (e) {
    console.log(`${id} scene ${i}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(outDir, `${id}-scene${i}-miss.png`) }).catch(() => {});
  }
}
const end = narrAt + duration * 1000 + 800 - Date.now();
if (end > 0) await pause(end);
const raw = await page.video().path();
await context.close();
await browser.close();
fs.writeFileSync(path.join(outDir, `${id}-timing.json`), JSON.stringify({ raw, offset: (narrAt - t0) / 1000, duration }));
console.log(id, "recorded; narration starts", ((narrAt - t0) / 1000).toFixed(2), "s into the raw video");
