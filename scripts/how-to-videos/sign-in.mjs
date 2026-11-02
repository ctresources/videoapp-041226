// Opens a browser window on the SparkReels sign-in page. The owner signs in to
// the demo account herself; once the app loads, the session is saved to the
// file given (kept OUTSIDE the repo; it is a login) for the recorder to reuse.
//
//   node scripts/how-to-videos/sign-in.mjs <path-to-save-session.json>
import { chromium } from "playwright";

const out = process.argv[2];
if (!out) { console.error("Give the path to save the session to."); process.exit(1); }
const BASE = process.env.HOWTO_BASE || "https://www.sparkreels.ai";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
console.log("Waiting for you to sign in (up to 10 minutes)…");
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const url = page.url();
  if (!/\/(login|register|auth)/.test(new URL(url).pathname) && new URL(url).hostname.includes("sparkreels")) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);
await context.storageState({ path: out });
console.log("Signed in. Session saved.");
await browser.close();
