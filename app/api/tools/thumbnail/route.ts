import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

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

/** Wrap headline into up to 4 lines of ~18 chars, longest-word safe. */
function wrapHeadline(text: string): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > 18 && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
    if (lines.length === 4) break;
  }
  if (line && lines.length < 4) lines.push(line.trim());
  return lines;
}

/**
 * POST /api/tools/thumbnail — { headline, projectId? }
 * Renders a 1280×720 YouTube thumbnail entirely in-app with sharp:
 * brand gradient background, bold wrapped headline, the agent's headshot in
 * a circle on the right, logo top-right, and a market badge. Uploads the PNG
 * to storage and returns its public URL (plus saves it to the project's
 * thumbnail_url when projectId is provided).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { headline, projectId } = (await req.json()) as { headline?: string; projectId?: string };
  if (!headline?.trim()) {
    return NextResponse.json({ error: "headline required" }, { status: 400 });
  }

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

  try {
    // @ts-ignore -- types unresolvable in some tsconfig setups, runtime import is fine
    const sharp = (await import("sharp")).default;

    const lines = wrapHeadline(headline.trim());
    const fontSize = lines.length <= 2 ? 92 : lines.length === 3 ? 76 : 64;
    const lineHeight = Math.round(fontSize * 1.15);
    const textBlockH = lines.length * lineHeight;
    const textStartY = Math.round(H / 2 - textBlockH / 2 + fontSize * 0.8);

    const market = [p?.location_city, p?.location_state].filter(Boolean).join(", ");
    const name = p?.full_name || "";

    const textSvgLines = lines
      .map((l, i) => `<text x="70" y="${textStartY + i * lineHeight}" class="headline">${escapeXml(l.toUpperCase())}</text>`)
      .join("");

    const bgSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f1e46"/>
      <stop offset="55%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <style>
    .headline { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: ${fontSize}px; fill: #ffffff; }
    .badge { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 30px; fill: #0f1e46; }
    .name { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 26px; fill: #ffffff; }
  </style>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 120}" cy="${H - 80}" r="340" fill="#ffffff" opacity="0.05"/>
  <circle cx="120" cy="60" r="220" fill="#ffffff" opacity="0.04"/>
  <rect x="70" y="${textStartY - fontSize - 26}" width="120" height="12" fill="url(#accent)"/>
  ${textSvgLines}
  ${market ? `
  <rect x="70" y="${H - 106}" rx="10" width="${Math.min(520, market.length * 17 + 60)}" height="52" fill="url(#accent)"/>
  <text x="96" y="${H - 70}" class="badge">📍 ${escapeXml(market.toUpperCase())}</text>` : ""}
  ${name ? `<text x="70" y="60" class="name">${escapeXml(name)}</text>` : ""}
</svg>`;

    let image = sharp(Buffer.from(bgSvg)).png();
    const composites: { input: Buffer; left: number; top: number }[] = [];

    // Headshot — circle-masked, right side
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
          // White ring behind the headshot
          const ring = Buffer.from(
            `<svg width="${size + 16}" height="${size + 16}"><circle cx="${(size + 16) / 2}" cy="${(size + 16) / 2}" r="${(size + 16) / 2 - 2}" fill="none" stroke="#f59e0b" stroke-width="8"/></svg>`,
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

    if (composites.length > 0) {
      image = sharp(await image.toBuffer()).composite(composites).png();
    }

    const png = await image.toBuffer();

    const path = `thumbnails/${user.id}/thumb_${Date.now()}.png`;
    const { error: uploadErr } = await admin.storage
      .from("assets")
      .upload(path, png, { contentType: "image/png", upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

    if (projectId) {
      await admin
        .from("projects")
        .update({ thumbnail_url: publicUrl })
        .eq("id", projectId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[thumbnail] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Thumbnail generation failed" },
      { status: 500 },
    );
  }
}
