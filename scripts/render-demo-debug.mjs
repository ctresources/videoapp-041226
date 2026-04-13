/**
 * Creatomate debug — test basic property formats
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
let envVars = {};
try {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k) envVars[k] = v;
  }
} catch { /**/ }

const API_KEY = envVars.CREATOMATE_API_KEY || process.env.CREATOMATE_API_KEY;
if (!API_KEY) { console.error("❌  CREATOMATE_API_KEY not found"); process.exit(1); }

// Try 3 different source formats to find which one Creatomate accepts

const tests = [
  {
    name: "Test A — only a text element, minimal props",
    source: {
      output_format: "mp4",
      width: 1280,
      height: 720,
      duration: 3,
      elements: [
        {
          type: "text",
          text: "Hello World",
          font_size: 60,
          fill_color: "#FFFFFF",
          x_alignment: "50%",
          y: "50%",
          width: "100%",
        },
      ],
    },
  },
  {
    name: "Test B — rectangle + text, no anchors",
    source: {
      output_format: "mp4",
      width: 1280,
      height: 720,
      duration: 3,
      elements: [
        {
          type: "rectangle",
          width: "100%",
          height: "100%",
          x: 0,
          y: 0,
          fill_color: "#0F172A",
        },
        {
          type: "text",
          text: "VoiceToVideos.AI",
          font_size: 60,
          fill_color: "#FFFFFF",
          x_alignment: "50%",
          y: "50%",
          width: "100%",
        },
      ],
    },
  },
  {
    name: "Test C — source with type: composition at root",
    source: {
      type: "composition",
      output_format: "mp4",
      width: 1280,
      height: 720,
      duration: 3,
      elements: [
        {
          type: "text",
          text: "Hello World",
          font_size: 60,
          fill_color: "#FFFFFF",
          x_alignment: "50%",
          y: "50%",
          width: "100%",
        },
      ],
    },
  },
];

async function runTest(test) {
  console.log(`\n━━━  ${test.name}  ━━━`);

  const res = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: test.source }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error("  ❌ HTTP", res.status, body);
    return null;
  }

  const [render] = JSON.parse(body);
  console.log(`  ✅ Submitted: ${render.id} | ${render.status}`);

  // Poll for 30 seconds
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const poll = await fetch(`https://api.creatomate.com/v1/renders/${render.id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await poll.json();
    console.log(`  [${i + 1}] ${data.status}`);
    if (data.status === "succeeded") {
      console.log(`  🎥  ${data.url}`);
      return data.url;
    }
    if (data.status === "failed") {
      console.error(`  ❌  ${data.error_message}`);
      return null;
    }
  }
  console.log("  ⏱  Still rendering, moving on…");
  return null;
}

// Run tests sequentially
for (const test of tests) {
  const url = await runTest(test);
  if (url) {
    console.log("\n🏆  Working format found! URL:", url);
    break;
  }
}

console.log("\nDone.");
