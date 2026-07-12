import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";
import { generateThumbnailBackground } from "@/lib/api/openai-image";
import { removeImageBackground } from "@/lib/utils/remove-background";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import * as opentypeNs from "opentype.js";

// opentype.js is an old UMD package — depending on how the server bundle
// resolves it, its functions land on the namespace itself or on .default.
// The plain default import came back undefined in the deployed bundle
// (crashing with "Cannot read properties of undefined (reading 'parse')"),
// so resolve whichever shape is actually present.
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs);

const W = 1280;
const H = 720;

// Vercel's Linux runtime has no system fonts, so SVG <text> renders as empty
// boxes. Instead we bundle Anton (OFL license — the classic tall condensed
// YouTube-thumbnail font) and convert every string to vector <path> outlines
// with opentype.js — renders identically on any server, no fontconfig needed.
let _font: opentypeNs.Font | null = null;
function getFont(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "Anton-Regular.ttf"));
    _font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _font;
}

function textPathData(text: string, x: number, y: number, fontSize: number): string {
  return getFont().getPath(text, x, y, fontSize).toPathData(2);
}

function textWidth(text: string, fontSize: number): number {
  return getFont().getAdvanceWidth(text, fontSize);
}

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const STATE_ABBRS = new Set(Object.values(STATE_NAMES));
// Leading words that aren't part of a city name ("Moving To Blue Bell PA")
const CITY_STOP_WORDS = new Set(["in", "to", "of", "near", "the", "why", "move", "moving", "living", "live", "buy", "buying", "sell", "selling", "visit", "about", "from"]);

/** Trailing run of word-ish tokens before a state, minus leading stop words. */
function trailingCityWords(before: string): string {
  const words = before.trim().replace(/[,\s]+$/, "").split(/\s+/);
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0 && out.length < 3; i--) {
    if (/^[A-Za-z.'-]+$/.test(words[i])) out.unshift(words[i]);
    else break;
  }
  while (out.length > 1 && CITY_STOP_WORDS.has(out[0].toLowerCase())) out.shift();
  return out.join(" ");
}

/**
 * Pull a "City, ST" / "City Pennsylvania" market mention out of free text
 * (video title or typed headline) — used when no project supplies one.
 */
function extractMarketFromText(text: string): { city: string; state: string } | null {
  const cleaned = text.replace(/[^\w\s,.'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  // Full state name anywhere ("... Blue Bell Pennsylvania ...")
  for (const [name, abbr] of Object.entries(STATE_NAMES)) {
    const idx = lower.indexOf(` ${name}`);
    if (idx > 0) {
      const city = trailingCityWords(cleaned.slice(0, idx + 1));
      if (city) return { city, state: abbr };
    }
  }

  // Two-letter abbreviation as its own UPPERCASE word ("Blue Bell, PA" /
  // "BLUE BELL PA"). Uppercase-only avoids "in"/"or"/"me" false matches;
  // the LAST valid candidate wins since markets usually close the phrase.
  const abbrRe = /(?:^|[\s,])([A-Z]{2})(?=[\s,.]|$)/g;
  let best: { city: string; state: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = abbrRe.exec(cleaned))) {
    const abbr = m[1];
    if (!STATE_ABBRS.has(abbr)) continue;
    const city = trailingCityWords(cleaned.slice(0, m.index));
    if (city) best = { city, state: abbr };
  }
  return best;
}

/** Largest font size at which the lines fit the width and height budget. */
function fitFontSize(lines: string[], maxWidth: number, maxBlockH: number, startSize: number): number {
  let f = startSize;
  const widest = () => Math.max(...lines.map((l) => textWidth(l, f)));
  while (f > 60 && (widest() > maxWidth || lines.length * f * 1.05 > maxBlockH)) f -= 6;
  return f;
}

/**
 * Try every contiguous 1–3 line wrap of the (max 4 word) headline and keep
 * whichever renders at the biggest font — short words stack for huge type.
 */
function bestHeadlineLayout(text: string, maxWidth: number, maxBlockH: number): { lines: string[]; fontSize: number } {
  const words = text.trim().split(/\s+/).slice(0, 4);
  const n = words.length;
  const candidates: string[][] = [[words.join(" ")]];
  for (let i = 1; i < n; i++) candidates.push([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
  for (let i = 1; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      candidates.push([words.slice(0, i).join(" "), words.slice(i, j).join(" "), words.slice(j).join(" ")]);
    }
  }
  let best: { lines: string[]; fontSize: number } = { lines: candidates[0], fontSize: 0 };
  for (const cand of candidates) {
    const size = fitFontSize(cand.map((l) => l.toUpperCase()), maxWidth, maxBlockH, 300);
    if (size > best.fontSize) best = { lines: cand, fontSize: size };
  }
  return best;
}

/**
 * AI-writes the thumbnail text: 3–4 words max, curiosity-driven, ALL CAPS,
 * never reusing words from the video title (the thumbnail must add to the
 * title, not repeat it).
 */
async function generateHeadline(title: string): Promise<string | null> {
  try {
    const raw = await perplexityChat([
      {
        role: "system",
        content: "You are a YouTube thumbnail copy specialist. You write ultra-short, curiosity-driven thumbnail text. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Write ONE piece of YouTube thumbnail text for this real estate video.

Video title: "${title}"

STRICT RULES:
- 3 to 4 words MAXIMUM.
- Create CURIOSITY — make the viewer need to click, but stay clear (no confusing wordplay).
- Do NOT reuse ANY meaningful word that already appears in the video title — the thumbnail must add new information, not repeat the title.
- ALL CAPS.
- No punctuation except ? or !.

Return ONLY this JSON: {"headline": "YOUR TEXT HERE"}`,
      },
    ], "sonar");

    let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    const { headline } = JSON.parse(text) as { headline?: string };
    if (!headline?.trim()) return null;
    return headline.trim().split(/\s+/).slice(0, 4).join(" ").toUpperCase();
  } catch (err) {
    console.error("[thumbnail-render] headline generation failed:", err);
    return null;
  }
}

export interface RenderThumbnailOptions {
  userId: string;
  projectId?: string;
  /** User-typed text; AI writes a 3–4 word curiosity hook when omitted. */
  headline?: string;
  /** Topic/title fallback when no project is given. */
  topic?: string;
  /** Photo to place on the thumbnail; defaults to the profile headshot. */
  photoUrl?: string;
  /** Which side the photo sits on; text takes the opposite side. Default right. */
  photoSide?: "left" | "right";
  /**
   * Reuse a previously generated background instead of creating a new one —
   * lets the user edit just the text and re-render in seconds.
   */
  backgroundUrl?: string;
}

/**
 * Renders a 1280×720 HD YouTube thumbnail and uploads it to storage:
 * - Text: 3–4 word ALL CAPS curiosity hook (AI-written when omitted) —
 *   thick and bold, white + vivid yellow with a heavy dark outline.
 * - Background: AI-generated bright vibrant still-frame-style scene with an
 *   exaggerated blue sky (bright two-color gradient fallback).
 * - The chosen photo (or profile headshot) bottom-right, market badge
 *   bottom-left. No logo — thumbnails stay clean.
 * When projectId is given, the URL is saved to the project (column +
 * seo_data) so the Publish window picks it up. Throws on failure.
 */
export async function renderAndSaveThumbnail(
  opts: RenderThumbnailOptions,
): Promise<{ url: string; headline: string; backgroundUrl: string }> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url, location_city, location_state")
    .eq("id", opts.userId)
    .single();

  const p = profile as {
    full_name: string | null; avatar_url: string | null;
    location_city: string | null; location_state: string | null;
  } | null;

  // Project context — title for the "no repeated words" rule, market for the scene
  let projectTitle = "";
  let projectSeoData: Record<string, unknown> | null = null;
  let projCity: string | null = null;
  let projState: string | null = null;
  if (opts.projectId) {
    const { data: proj } = await admin
      .from("projects")
      .select("title, seo_data, ai_script, location_city, location_state, user_id")
      .eq("id", opts.projectId)
      .single();
    const pr = proj as { title: string; seo_data: Record<string, unknown> | null; ai_script: Record<string, unknown> | null; location_city: string | null; location_state: string | null; user_id: string } | null;
    if (!pr || pr.user_id !== opts.userId) {
      throw new Error("Project not found");
    }
    projectTitle = pr.title || "";
    projectSeoData = pr.seo_data;
    // Older projects stored the typed market only inside ai_script.location
    // ("City, ST") — use it before falling back to the profile's home market.
    const scriptLoc = ((pr.ai_script?.location as string | undefined) || "").split(",");
    projCity = pr.location_city || scriptLoc[0]?.trim() || null;
    projState = pr.location_state || scriptLoc[1]?.trim() || null;
  }

  const sourceTitle = (opts.topic || projectTitle || "").trim();
  let headlineText = opts.headline?.trim() || "";
  if (!headlineText) {
    if (!sourceTitle) throw new Error("Select a project or type a headline first");
    headlineText = (await generateHeadline(sourceTitle)) || "";
  }
  if (!headlineText) throw new Error("Could not write a headline — type one and try again");
  headlineText = headlineText.split(/\s+/).slice(0, 4).join(" ").toUpperCase();

  // Market priority: the project's stored market → a "City, ST" mention in
  // the title/headline text itself → the profile's home market.
  const textMarket = extractMarketFromText([sourceTitle, opts.headline].filter(Boolean).join(" "));
  const city = projCity || textMarket?.city || p?.location_city || undefined;
  const state = projState || textMarket?.state || p?.location_state || undefined;

  // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
  const sharp = (await import("sharp")).default;

  // ── Background: reuse the caller's, else AI scene, else bright gradient ──
  let baseBuffer: Buffer | null = null;
  let backgroundUrl = "";

  if (opts.backgroundUrl) {
    try {
      const res = await fetch(opts.backgroundUrl);
      if (res.ok) {
        baseBuffer = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize(W, H, { fit: "cover" })
          .png()
          .toBuffer();
        backgroundUrl = opts.backgroundUrl;
      }
    } catch { /* fall through to a fresh background */ }
  }

  if (!baseBuffer) {
    const aiBg = await generateThumbnailBackground({
      topic: sourceTitle || headlineText,
      city,
      state,
    });

    if (aiBg) {
      baseBuffer = await sharp(aiBg).resize(W, H, { fit: "cover" }).png().toBuffer();
    } else {
      // Bright two-color palettes — picked at random so "New Background"
      // visibly changes even without an AI image key.
      const palettes: [string, string, string][] = [
        ["#0ea5e9", "#2563eb", "#f59e0b"], // sky blue → gold
        ["#22c55e", "#047857", "#fde047"], // green → yellow
        ["#8b5cf6", "#6d28d9", "#f472b6"], // violet → pink
        ["#f97316", "#b91c1c", "#facc15"], // orange → red
        ["#06b6d4", "#0e7490", "#a3e635"], // teal → lime
      ];
      const [c1, c2, c3] = palettes[Math.floor(Math.random() * palettes.length)];
      const gradSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="60%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 120}" cy="${H - 80}" r="340" fill="#ffffff" opacity="0.08"/>
  <circle cx="120" cy="60" r="220" fill="#ffffff" opacity="0.06"/>
</svg>`;
      baseBuffer = await sharp(Buffer.from(gradSvg)).png().toBuffer();
    }

    // Store the bare background so "edit text only" re-renders can reuse it
    // without paying for a new AI image.
    const bgPath = `thumbnails/${opts.userId}/bg_${Date.now()}.png`;
    const { error: bgErr } = await admin.storage
      .from("assets")
      .upload(bgPath, baseBuffer, { contentType: "image/png", upsert: false });
    if (!bgErr) {
      backgroundUrl = admin.storage.from("assets").getPublicUrl(bgPath).data.publicUrl;
    }
  }

  // ── Headline: vector outlines — thick, bold, ALL CAPS, white + vivid yellow ──
  // 2x type: up to 3 stacked lines, sized as large as the space allows while
  // leaving room for the market badge at the bottom. Text always takes the
  // side opposite the photo.
  const photoSide = opts.photoSide === "left" ? "left" : "right";
  const { lines, fontSize } = bestHeadlineLayout(headlineText, 700, 460);

  const strokeW = Math.max(12, Math.round(fontSize * 0.11));
  const lineHeight = Math.round(fontSize * 1.05);
  const textBlockH = lines.length * lineHeight;
  const textStartY = Math.round(H / 2 - textBlockH / 2 + fontSize * 0.8);

  // Two passes per line: heavy dark outline underneath, colored fill on top —
  // guaranteed to render in librsvg without relying on paint-order support.
  const headlinePaths = lines
    .map((l, i) => {
      const upper = l.toUpperCase();
      const x = photoSide === "left" ? W - 60 - textWidth(upper, fontSize) : 60;
      const d = textPathData(upper, x, textStartY + i * lineHeight, fontSize);
      const fill = i % 2 === 0 ? "#ffffff" : "#ffe600";
      return `<path d="${d}" fill="none" stroke="#10132b" stroke-width="${strokeW}" stroke-linejoin="round"/>
<path d="${d}" fill="${fill}"/>`;
    })
    .join("\n");

  // ── Market badge — bottom-left corner (no logo on thumbnails) ──
  const market = [city, state].filter(Boolean).join(", ").toUpperCase();
  let badgeSvg = "";
  const bottomMargin = 34;
  if (market) {
    // 2x badge: shrink only if an unusually long market name would collide
    // with the photo. Sits under the headline, opposite the photo.
    let badgeFontSize = 52;
    while (badgeFontSize > 26 && textWidth(market, badgeFontSize) > 620) badgeFontSize -= 4;
    const badgeTextW = textWidth(market, badgeFontSize);
    const badgeH = Math.round(badgeFontSize * 1.7);
    const badgeY = H - badgeH - bottomMargin;
    const badgeX = photoSide === "left" ? W - 60 - (badgeTextW + 58) : 60;
    const badgeTextD = textPathData(market, badgeX + 28, badgeY + Math.round(badgeH * 0.72), badgeFontSize);
    badgeSvg = `
  <rect x="${badgeX}" y="${badgeY}" rx="14" width="${badgeTextW + 58}" height="${badgeH}" fill="#ffe600"/>
  <path d="${badgeTextD}" fill="#10132b"/>`;
  }

  const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="${photoSide === "left" ? "100%" : "0%"}" y1="0%" x2="${photoSide === "left" ? "0%" : "100%"}" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  ${headlinePaths}
  ${badgeSvg}
</svg>`;

  const composites: { input: Buffer; left: number; top: number }[] = [
    { input: Buffer.from(overlaySvg), left: 0, top: 0 },
  ];

  // Photo — the chosen look or the profile headshot, anchored bottom-right so
  // the person stands on the edge. Background auto-removed when a
  // REMOVEBG_API_KEY is configured; otherwise the photo is used as-is.
  const photoSrc = opts.photoUrl || p?.avatar_url;
  if (photoSrc) {
    try {
      // Cutout cache: each unique photo is background-removed once, ever —
      // repeat renders reuse the stored cutout, so the remove.bg free tier
      // (50 images/month) is effectively unlimited.
      const cutoutKey = `thumbnails/cutouts/${createHash("sha1").update(photoSrc).digest("hex")}.png`;
      let photoInput: Buffer | null = null;

      if (process.env.REMOVEBG_API_KEY) {
        const { data: cached } = await admin.storage.from("assets").download(cutoutKey);
        if (cached) photoInput = Buffer.from(await cached.arrayBuffer());
      }

      if (!photoInput) {
        const res = await fetch(photoSrc);
        if (res.ok) {
          photoInput = Buffer.from(await res.arrayBuffer());
          const cutout = await removeImageBackground(photoInput);
          if (cutout) {
            // Trim the transparent padding around the cutout so the subject
            // sizes and anchors consistently.
            try {
              photoInput = await sharp(cutout).trim().png().toBuffer();
            } catch {
              photoInput = cutout;
            }
            await admin.storage.from("assets").upload(cutoutKey, photoInput, { contentType: "image/png", upsert: true });
          }
        }
      }

      if (photoInput) {
        const photo = await sharp(photoInput)
          .resize({ width: 480, height: 640, fit: "inside" })
          .png()
          .toBuffer();
        const meta = await sharp(photo).metadata();
        const pw = meta.width || 480;
        const ph = meta.height || 640;
        composites.push({ input: photo, left: photoSide === "left" ? 40 : W - pw - 40, top: H - ph });
      }
    } catch { /* thumbnail still renders without the photo */ }
  }

  // HD export: full-quality PNG at 1280×720
  const png = await sharp(baseBuffer).composite(composites).png({ compressionLevel: 6 }).toBuffer();

  const storagePath = `thumbnails/${opts.userId}/thumb_${Date.now()}.png`;
  const { error: uploadErr } = await admin.storage
    .from("assets")
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);

  if (opts.projectId) {
    // Save on the project column AND inside seo_data — the Publish window
    // reads the thumbnail from there when uploading to YouTube.
    await admin
      .from("projects")
      .update({
        thumbnail_url: publicUrl,
        seo_data: { ...(projectSeoData || {}), thumbnail_url: publicUrl },
      })
      .eq("id", opts.projectId)
      .eq("user_id", opts.userId);
  }

  return { url: publicUrl, headline: headlineText, backgroundUrl };
}
