import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";
import { generateThumbnailBackground } from "@/lib/api/openai-image";
import { NextRequest, NextResponse } from "next/server";

// AI background generation can take up to a minute on its own.
export const maxDuration = 120;

const W = 1280;
const H = 720;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
 * and never reusing words from the video title (the thumbnail must add to the
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
    console.error("[thumbnail] headline generation failed:", err);
    return null;
  }
}

/**
 * POST /api/tools/thumbnail — { headline?, topic?, projectId? }
 * Renders a 1280×720 HD YouTube thumbnail:
 * - Text: 3–4 word curiosity hook (AI-written from the video title when the
 *   user leaves the field blank) — thick, bold, ALL CAPS, white + vivid
 *   yellow with a heavy dark outline.
 * - Background: AI-generated bright vibrant still-frame-style scene with an
 *   exaggerated blue sky (falls back to a bright two-color gradient).
 * - The user's headshot photo in a circle on the right, logo top-right.
 * Uploads the PNG to storage; when projectId is given, saves it to the
 * project so the Publish window shows it at upload time.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { headline, topic, projectId } = (await req.json()) as {
    headline?: string; topic?: string; projectId?: string;
  };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url, logo_url, location_city, location_state")
    .eq("id", user.id)
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
  if (projectId) {
    const { data: proj } = await admin
      .from("projects")
      .select("title, seo_data, location_city, location_state, user_id")
      .eq("id", projectId)
      .single();
    const pr = proj as { title: string; seo_data: Record<string, unknown> | null; location_city: string | null; location_state: string | null; user_id: string } | null;
    if (pr && pr.user_id === user.id) {
      projectTitle = pr.title || "";
      projectSeoData = pr.seo_data;
      projCity = pr.location_city;
      projState = pr.location_state;
    }
  }

  const sourceTitle = (topic || projectTitle || "").trim();
  let headlineText = headline?.trim() || "";
  if (!headlineText) {
    if (!sourceTitle) {
      return NextResponse.json(
        { error: "Select a project or type a headline first" },
        { status: 400 },
      );
    }
    headlineText = (await generateHeadline(sourceTitle)) || "";
  }
  if (!headlineText) {
    return NextResponse.json({ error: "Could not write a headline — type one and try again" }, { status: 500 });
  }
  headlineText = headlineText.split(/\s+/).slice(0, 4).join(" ").toUpperCase();

  const city = projCity || p?.location_city || undefined;
  const state = projState || p?.location_state || undefined;

  try {
    // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
    const sharp = (await import("sharp")).default;

    // ── Background: AI still-frame scene, else bright two-color gradient ──
    const aiBg = await generateThumbnailBackground({
      topic: sourceTitle || headlineText,
      city,
      state,
    });

    let baseBuffer: Buffer;
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

    // ── Headline overlay: thick, bold, ALL CAPS, white + vivid yellow, heavy outline ──
    const lines = wrapHeadline(headlineText);
    const fontSize = lines.length === 1 ? 150 : 128;
    const lineHeight = Math.round(fontSize * 1.08);
    const textBlockH = lines.length * lineHeight;
    const textStartY = Math.round(H / 2 - textBlockH / 2 + fontSize * 0.8);

    const textSvgLines = lines
      .map((l, i) =>
        `<text x="60" y="${textStartY + i * lineHeight}" class="headline" fill="${i % 2 === 0 ? "#ffffff" : "#ffe600"}">${escapeXml(l.toUpperCase())}</text>`,
      )
      .join("");

    const market = [city, state].filter(Boolean).join(", ");

    const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <style>
    .headline { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: ${fontSize}px; letter-spacing: 1px; stroke: #10132b; stroke-width: 14px; paint-order: stroke fill; }
    .badge { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 28px; fill: #10132b; }
  </style>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  ${textSvgLines}
  ${market ? `
  <rect x="60" y="${H - 96}" rx="10" width="${Math.min(500, market.length * 16 + 56)}" height="48" fill="#ffe600"/>
  <text x="84" y="${H - 62}" class="badge">📍 ${escapeXml(market.toUpperCase())}</text>` : ""}
</svg>`;

    const composites: { input: Buffer; left: number; top: number }[] = [
      { input: Buffer.from(overlaySvg), left: 0, top: 0 },
    ];

    // Headshot — the user's selected profile photo, circle-masked, right side
    if (p?.avatar_url) {
      try {
        const res = await fetch(p.avatar_url);
        if (res.ok) {
          const size = 420;
          const circleMask = Buffer.from(
            `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="#fff"/></svg>`,
          );
          const headshot = await sharp(Buffer.from(await res.arrayBuffer()))
            .resize(size, size, { fit: "cover", position: "attention" })
            .composite([{ input: circleMask, blend: "dest-in" }])
            .png()
            .toBuffer();
          const ring = Buffer.from(
            `<svg width="${size + 16}" height="${size + 16}"><circle cx="${(size + 16) / 2}" cy="${(size + 16) / 2}" r="${(size + 16) / 2 - 2}" fill="none" stroke="#ffe600" stroke-width="10"/></svg>`,
          );
          composites.push({ input: ring, left: W - size - 78, top: H - size - 78 });
          composites.push({ input: headshot, left: W - size - 70, top: H - size - 70 });
        }
      } catch { /* thumbnail still renders without the headshot */ }
    }

    // Logo — top-right, scaled to fit
    if (p?.logo_url) {
      try {
        const res = await fetch(p.logo_url);
        if (res.ok) {
          const logo = await sharp(Buffer.from(await res.arrayBuffer()))
            .resize({ width: 170, height: 90, fit: "inside" })
            .png()
            .toBuffer();
          composites.push({ input: logo, left: W - 200, top: 30 });
        }
      } catch { /* thumbnail still renders without the logo */ }
    }

    // HD export: full-quality PNG at 1280×720
    const png = await sharp(baseBuffer).composite(composites).png({ compressionLevel: 6 }).toBuffer();

    const path = `thumbnails/${user.id}/thumb_${Date.now()}.png`;
    const { error: uploadErr } = await admin.storage
      .from("assets")
      .upload(path, png, { contentType: "image/png", upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

    if (projectId && projectTitle !== undefined) {
      // Save on the project column AND inside seo_data — the Publish window
      // reads the thumbnail from there when uploading to YouTube.
      await admin
        .from("projects")
        .update({
          thumbnail_url: publicUrl,
          seo_data: { ...(projectSeoData || {}), thumbnail_url: publicUrl },
        })
        .eq("id", projectId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ url: publicUrl, headline: headlineText });
  } catch (err) {
    console.error("[thumbnail] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Thumbnail generation failed" },
      { status: 500 },
    );
  }
}
