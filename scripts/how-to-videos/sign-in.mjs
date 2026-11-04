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
// HOWTO_SIGNIN_MINUTES waits longer, for when the owner is away from the screen.
const MINUTES = Number(process.env.HOWTO_SIGNIN_MINUTES) || 10;
console.log(`Waiting for you to sign in (up to ${MINUTES} minutes)…`);
const deadline = Date.now() + MINUTES * 60_000;
let signedIn = false;
while (Date.now() < deadline) {
  const url = page.url();
  if (!/\/(login|register|auth)/.test(new URL(url).pathname) && new URL(url).hostname.includes("sparkreels")) { signedIn = true; break; }
  await page.waitForTimeout(1000);
}
if (!signedIn) {
  console.log(`Not signed in after ${MINUTES} minutes; nothing saved.`);
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(3000);
await context.storageState({ path: out });
console.log("Signed in. Session saved.");
await browser.close();
