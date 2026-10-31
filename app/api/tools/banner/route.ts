import { createClient } from "@/lib/supabase/server";
import { renderAndSaveYouTubeBanner } from "@/lib/utils/youtube-banner-render";
import { isSocialPlatform, renderAndSaveSocialBanner } from "@/lib/utils/social-banner-render";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import type { BannerLayout } from "@/lib/utils/banner-layout";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/staff/staff";

// QR generation + multi-photo compositing at 2560×1440 can take a bit.
export const maxDuration = 60;

/**
 * POST /api/tools/banner
 * Renders a banner (editable text, up to two QR codes, 0–2 photos) and
 * returns its URL. `platform` picks the canvas: "facebook" (1640×720 cover)
 * or "linkedin" (1584×396); anything else — including requests that don't
 * send it — is the 2560×1440 YouTube channel banner.
 *
 * The YouTube banner is the safe-zone layout since 2026-10-16 (photo, name,
 * brokerage, tagline, contact line and logo inside the centre 1546×423), so
 * it reads the fields below the platform's; the headline/QR/SUBSCRIBE fields
 * are the Facebook and LinkedIn banners' only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Spark Tools use, for Admin → Staff activity (2026-10-30).
  await logActivity(user.id, "tool:banner");

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const body = (await req.json()) as {
    headline?: string;
    qr1Caption?: string;
    qr1Link?: string;
    subscribeKicker?: string;
    subscribeMain?: string;
    subscribeSub?: string;
    extraLine1?: string;
    extraLine2?: string;
    qr2Caption?: string;
    qr2Link?: string;
    photoUrls?: string[];
    palette?: string;
    /** The agent's own colors when palette is "custom"; checked by customPalette. */
    customColors?: { bgLeft?: string; bgRight?: string; text?: string; accent?: string };
    /** LinkedIn and Facebook only: which side of the text the photos sit. */
    photoSide?: string;
    platform?: string;
    /** Per-block alignment, nudge, size and visibility. */
    layout?: BannerLayout;
    /** The YouTube banner's own fields. */
    name?: string;
    brokerage?: string;
    tagline?: string;
    phone?: string;
    email?: string;
    website?: string;
    photoUrl?: string;
    logoUrl?: string;
  };

  try {
    const fields = {
      userId: user.id,
      headline: body.headline,
      qr1Caption: body.qr1Caption,
      qr1Link: body.qr1Link,
      subscribeKicker: body.subscribeKicker,
      subscribeMain: body.subscribeMain,
      subscribeSub: body.subscribeSub,
      extraLine1: body.extraLine1,
      extraLine2: body.extraLine2,
      qr2Caption: body.qr2Caption,
      qr2Link: body.qr2Link,
      photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls : undefined,
      palette: body.palette,
      customColors: body.customColors && typeof body.customColors === "object" ? body.customColors : undefined,
      // Only the YouTube canvas is a spatial template with blocks to move;
      // the social ones are a single centred stack, where an alignment would
      // mean nothing. Passed through regardless — the social renderer ignores
      // what it has no use for.
      layout: body.layout,
    };
    const result = isSocialPlatform(body.platform)
      ? await renderAndSaveSocialBanner({
          ...fields,
          platform: body.platform,
          photoSide: body.photoSide === "right" ? "right" : "left",
        })
      : await renderAndSaveYouTubeBanner(user.id, {
          name: body.name,
          brokerage: body.brokerage,
          tagline: body.tagline,
          phone: body.phone,
          email: body.email,
          website: body.website,
          photoUrl: body.photoUrl,
          logoUrl: body.logoUrl,
          palette: body.palette,
          customColors: fields.customColors,
        });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[banner] Error:", err);
    const msg = err instanceof Error ? err.message : "Banner generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
