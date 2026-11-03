// Starts a desk episode on the signed-in account through the live app, from a
// saved conversation, with a ready-made co-host by name.
//   node scripts/podcast-proto/live-test.mjs <session.json> <script.json> <coHostName> [twinLookId]
import { chromium } from "playwright";
import fs from "fs";
const [session, scriptFile, coName, lookId] = process.argv.slice(2);
const B = process.env.HOWTO_BASE || "https://www.sparkreels.ai";
const convo = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
const b = await chromium.launch();
const c = await b.newContext({ storageState: session });
// A page load refreshes the sign-in before the API calls.
const pg = await c.newPage();
await pg.goto(`${B}/create`, { waitUntil: "networkidle" }).catch(() => {});
await pg.waitForTimeout(2000);
const setup = await (await c.request.get(`${B}/api/podcast/setup`)).json();
console.log("cost", setup.cost, "| long videos left", setup.videosLeft, "| has twin", setup.hasTwin, "| partners", setup.partners?.length);
const co = setup.coHosts.find((x) => x.name.toLowerCase().startsWith(coName.toLowerCase()));
if (!co) throw new Error(`No co-host ${coName}`);
const r = await c.request.post(`${B}/api/podcast/make`, {
  data: { title: convo.title, turns: convo.turns, coHostId: co.id, setId: "warm", layout: "desk", ...(lookId && { lookId }) },
  timeout: 120_000,
});
console.log("make", r.status(), (await r.text()).slice(0, 300));
await b.close();
