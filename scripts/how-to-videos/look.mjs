// Looks over app pages with a saved session: a screenshot and the visible
// buttons, tabs, boxes and section ids of each, so recording steps can name
// real controls. Settings pages are reached through the menu (a direct load
// of /settings bounces to Home).
//
//   node scripts/how-to-videos/look.mjs <session.json> <out-dir> /create /settings/social ...
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [session, outDir, ...paths] = process.argv.slice(2);
const BASE = process.env.HOWTO_BASE || "https://www.sparkreels.ai";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: session, viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
for (const p of paths) {
  if (p.startsWith("/settings")) {
    await page.goto(`${BASE}/create`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    await page.waitForURL(/\/settings/);
    if (p !== "/settings") {
      await page.waitForTimeout(1500);
      await page.locator(`a[href="${p}"]`).first().click();
      await page.waitForURL(new RegExp(p.replace(/\//g, "\\/")));
    }
  } else {
    await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  }
  await page.waitForTimeout(3500);
  const name = p.replace(/[^a-z0-9]+/gi, "_") || "home";
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  const controls = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href], [role=tab], input, textarea, select, h1, h2, h3, [id]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest("aside, nav") && !el.matches("[role=tab]")) continue;
      const tag = el.tagName.toLowerCase();
      if (!/^(button|a|input|textarea|select|h1|h2|h3)$/.test(tag) && !el.matches("[role=tab]")) {
        if (el.id && !el.id.startsWith("radix") && !el.id.startsWith("__")) out.push(`#${el.id} @${Math.round(r.top + scrollY)}`);
        continue;
      }
      const label = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 70);
      if (!label) continue;
      out.push(`${tag}${el.getAttribute("role") === "tab" ? "[tab]" : ""}${el.id ? "#" + el.id : ""} @${Math.round(r.top + scrollY)} ${label}`);
    }
    return out;
  });
  fs.writeFileSync(path.join(outDir, `${name}.txt`), `${page.url()}\n${controls.join("\n")}`);
  console.log(p, "→", page.url(), controls.length);
}
await browser.close();
