/**
 * Reads the How It Works page and writes its words as plain text, for Ask
 * Sparklee (lib/help/page-guide.ts).
 *
 * The page stays the one place the guide is written. This runs before every
 * build (package.json "prebuild"), so whatever the page says is what Sparklee
 * answers from, with nothing to keep in step by hand. Run it yourself after
 * editing the page to refresh the committed copy:  node scripts/build-guide.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = fs.readFileSync(path.join(root, "app/(dashboard)/help/page.tsx"), "utf8");

const ENTITIES = {
  "&apos;": "'", "&quot;": '"', "&amp;": "&", "&ldquo;": "“", "&rdquo;": "”",
  "&lsquo;": "‘", "&rsquo;": "’", "&mdash;": "—", "&ndash;": "–",
  "&rarr;": "→", "&larr;": "←", "&times;": "×", "&nbsp;": " ", "&hellip;": "…",
};

function clean(jsx) {
  let s = jsx;
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");          // JSX comments
  s = s.replace(/\{"\s*"\}/g, " ");                     // {" "}
  s = s.replace(/\{"([^"{}]*)"\}/g, "$1");              // {"text"}
  s = s.replace(/\s+/g, " ");                           // source line breaks are not breaks
  s = s.replace(/<\/(li|tr|p|h[1-6]|div)>/g, "\n");
  s = s.replace(/<\/(td|th)>/g, " | ");
  s = s.replace(/<span className="block[^"]*"[^>]*>/g, "\n");
  s = s.replace(/<br\s*\/?>/g, "\n");
  s = s.replace(/<[^<>]*>/g, " ");                      // every other tag
  s = s.replace(/\{[^{}]*\}/g, " ");                    // leftover expressions
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  return s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/^\|\s*|\s*\|\s*$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

const steps = [];
const stepRe = /<Step n=\{(\d+)\} title="([^"]+)"[^>]*>([\s\S]*?)<\/Step>/g;
for (const m of src.matchAll(stepRe)) {
  steps.push({ n: Number(m[1]), title: m[2], text: clean(m[3]) });
}

// Each part's heading and whatever sits under it before its first step: the
// "Ways To Create" table, the weekly rhythm, and so on.
const parts = [];
const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
const heads = [...src.matchAll(h2Re)];
heads.forEach((m, i) => {
  const start = m.index + m[0].length;
  const nextHead = heads[i + 1]?.index ?? src.length;
  const nextStep = src.indexOf("<Step n=", start);
  const end = nextStep !== -1 && nextStep < nextHead ? nextStep : nextHead;
  parts.push({ title: clean(m[1]), text: clean(src.slice(start, end)) });
});

if (steps.length < 10) {
  console.error(`[build-guide] only ${steps.length} steps found; the How It Works page format may have changed`);
  process.exit(1);
}

const out = path.join(root, "lib/help/guide.generated.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ steps, parts }, null, 2) + "\n");
console.log(`[build-guide] ${steps.length} steps, ${parts.length} parts → lib/help/guide.generated.json`);
