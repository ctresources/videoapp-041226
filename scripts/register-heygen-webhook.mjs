/**
 * Register (or inspect) the HeyGen webhook endpoint.
 *
 * HeyGen signs deliveries only to endpoints registered this way — the
 * per-request callback_url path carries no signature at all. Registering
 * returns a signing secret that is shown ONCE.
 *
 *   node scripts/register-heygen-webhook.mjs list
 *   node scripts/register-heygen-webhook.mjs add https://your-domain.com/api/video/webhook
 *   node scripts/register-heygen-webhook.mjs delete <endpoint_id>
 *
 * Reads HEYGEN_API_KEY from .env.local. After `add`, set in your production env:
 *   HEYGEN_WEBHOOK_SECRET=<the secret printed once>
 *   HEYGEN_WEBHOOK_REGISTERED=true      # stops sending per-request callback_url
 * then, once the logs show "Signature verified ✓":
 *   HEYGEN_WEBHOOK_ENFORCE=true         # start rejecting unsigned deliveries
 */
import { readFileSync } from "node:fs";

const API = "https://api.heygen.com";

// Events the app actually handles — see the success/failed branches in
// app/api/video/webhook/route.ts. Subscribing to more just adds noise.
const EVENTS = [
  "avatar_video.success",
  "avatar_video.fail",
  "video_agent.success",
  "video_agent.fail",
];

function apiKey() {
  const fromEnv = process.env.HEYGEN_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    const m = readFileSync(".env.local", "utf8").match(/^HEYGEN_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch { /* fall through */ }
  console.error("HEYGEN_API_KEY not found in env or .env.local");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === "list") {
  const out = await call("/v3/webhooks/endpoints");
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === "add") {
  if (!arg?.startsWith("https://")) {
    console.error("Pass the full https URL, e.g. https://your-domain.com/api/video/webhook");
    process.exit(1);
  }
  const out = await call("/v3/webhooks/endpoints", {
    method: "POST",
    body: JSON.stringify({ url: arg, events: EVENTS }),
  });
  console.log(JSON.stringify(out, null, 2));
  console.log("\n⚠  The secret above is shown ONCE. Store it as HEYGEN_WEBHOOK_SECRET now.");
} else if (cmd === "delete") {
  if (!arg) { console.error("Pass the endpoint id (see `list`)"); process.exit(1); }
  await call(`/v3/webhooks/endpoints/${arg}`, { method: "DELETE" });
  console.log("deleted", arg);
} else {
  console.log("usage: register-heygen-webhook.mjs list | add <https-url> | delete <endpoint_id>");
}
