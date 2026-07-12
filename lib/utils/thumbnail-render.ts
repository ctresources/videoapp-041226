import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";
import { generateThumbnailBackground } from "@/lib/api/openai-image";
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
// boxes. Instead we bundle Archivo Black (OFL license) and convert every
// string to vector <path> outlines with opentype.js — renders identically on
// any server, no fontconfig needed.
let _font: opentypeNs.Font | null = null;
function getFont(): opentypeNs.Font {
  if (!_font) {
    const buf = readFileSync(path.join(process.cwd(), "fonts", "ArchivoBlack-Regular.ttf"));
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

/**
 * Cut the person out of their photo with remove.bg so only they appear on
 * the thumbnail — no white studio rectangle. Returns null when
 * REMOVEBG_API_KEY isn't configured or the call fails; the caller then uses
 * the original photo unchanged. Free remove.bg accounts include 50
 * preview-quality images/month, which is plenty at thumbnail size.
 */
async function removePhotoBackground(photoBuffer: Buffer): Promise<Buffer | null> {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("image_file", new Blob([new Uint8Array(photoBuffer)]), "photo.png");
    form.append("size", "auto");
    form.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (!res.ok) {
      console.warn(`[thumbnail-render] remove.bg failed (${res.status}):`, (await res.text()).slice(0, 200));
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn("[thumbnail-render] remove.bg error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Wrap the 3–4 word headline into up to 2 short lines. */
function wrapHeadline(text: string): string[] {
  const words = text.trim().split(/\s+/).slice(0, 4);
  if (words.length <= 2) return [words.join(" ")];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
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
 * - The chosen photo (or profile headshot) in a ringed circle on the right;
 *   brokerage logo bottom-left with the market badge stacked above it.
 * When projectId is given, the URL is saved to the project (column +
 * seo_data) so the Publish window picks it up. Throws on failure.
 */
export async function renderAndSaveThumbnail(
  opts: RenderThumbnailOptions,
): Promise<{ url: string; headline: string; backgroundUrl: string }> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url, logo_url, location_city, location_state")
    .eq("id", opts.userId)
    .single();

  const p = profile as {
    full_name: string | null; avatar_url: string | null; logo_url: string | null;
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
      .select("title, seo_data, location_city, location_state, user_id")
      .eq("id", opts.projectId)
      .single();
    const pr = proj as { title: string; seo_data: Record<string, unknown> | null; location_city: string | null; location_state: string | null; user_id: string } | null;
    if (!pr || pr.user_id !== opts.userId) {
      throw new Error("Project not found");
    }
    projectTitle = pr.title || "";
    projectSeoData = pr.seo_data;
    projCity = pr.location_city;
    projState = pr.location_state;
  }

  const sourceTitle = (opts.topic || projectTitle || "").trim();
  let headlineText = opts.headline?.trim() || "";
  if (!headlineText) {
    if (!sourceTitle) throw new Error("Select a project or type a headline first");
    headlineText = (await generateHeadline(sourceTitle)) || "";
  }
  if (!headlineText) throw new Error("Could not write a headline — type one and try again");
  headlineText = headlineText.split(/\s+/).slice(0, 4).join(" ").toUpperCase();

  const city = projCity || p?.location_city || undefined;
  const state = projState || p?.location_state || undefined;

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
      // Two bright vibrant colors: vivid sky blue → sunny golden yellow
      const gradSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="60%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#f59e0b"/>
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

  // ── Fetch the logo FIRST so the badge can stack neatly above it ──
  let logoBuffer: Buffer | null = null;
  let logoW = 0;
  let logoH = 0;
  if (p?.logo_url) {
    try {
      const res = await fetch(p.logo_url);
      if (res.ok) {
        logoBuffer = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize({ width: 200, height: 100, fit: "inside" })
          .png()
          .toBuffer();
        const meta = await sharp(logoBuffer).metadata();
        logoW = meta.width || 200;
        logoH = meta.height || 100;
      }
    } catch { /* thumbnail still renders without the logo */ }
  }

  // ── Headline: vector outlines — thick, bold, ALL CAPS, white + vivid yellow ──
  const lines = wrapHeadline(headlineText);
  const maxTextWidth = 700; // stay clear of the photo circle on the right
  let fontSize = lines.length === 1 ? 150 : 128;
  const widest = () => Math.max(...lines.map((l) => textWidth(l.toUpperCase(), fontSize)));
  while (fontSize > 48 && widest() > maxTextWidth) fontSize -= 6;

  const lineHeight = Math.round(fontSize * 1.12);
  const textBlockH = lines.length * lineHeight;
  const textStartY = Math.round(H / 2 - textBlockH / 2 + fontSize * 0.8);

  // Two passes per line: heavy dark outline underneath, colored fill on top —
  // guaranteed to render in librsvg without relying on paint-order support.
  const headlinePaths = lines
    .map((l, i) => {
      const d = textPathData(l.toUpperCase(), 60, textStartY + i * lineHeight, fontSize);
      const fill = i % 2 === 0 ? "#ffffff" : "#ffe600";
      return `<path d="${d}" fill="none" stroke="#10132b" stroke-width="16" stroke-linejoin="round"/>
<path d="${d}" fill="${fill}"/>`;
    })
    .join("\n");

  // ── Market badge — bottom-left, stacked above the logo ──
  const market = [city, state].filter(Boolean).join(", ").toUpperCase();
  let badgeSvg = "";
  const bottomMargin = 34;
  const logoTop = logoBuffer ? H - logoH - bottomMargin : 0;
  if (market) {
    const badgeFontSize = 26;
    const badgeTextW = textWidth(market, badgeFontSize);
    const badgeH = 48;
    const badgeY = logoBuffer ? logoTop - badgeH - 14 : H - badgeH - bottomMargin;
    const badgeTextD = textPathData(market, 84, badgeY + 34, badgeFontSize);
    badgeSvg = `
  <rect x="60" y="${badgeY}" rx="10" width="${Math.min(560, badgeTextW + 48)}" height="${badgeH}" fill="#ffe600"/>
  <path d="${badgeTextD}" fill="#10132b"/>`;
  }

  const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0%" y1="0%" x2="100%" y2="0%">
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
          const cutout = await removePhotoBackground(photoInput);
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
        composites.push({ input: photo, left: W - pw - 40, top: H - ph });
      }
    } catch { /* thumbnail still renders without the photo */ }
  }

  // Logo — bottom-left corner
  if (logoBuffer) {
    composites.push({ input: logoBuffer, left: 60, top: logoTop });
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
