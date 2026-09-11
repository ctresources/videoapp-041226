import { createClient } from "@/lib/supabase/server";
import { renderAndSaveBanner } from "@/lib/utils/banner-render";
import { isSocialPlatform, renderAndSaveSocialBanner } from "@/lib/utils/social-banner-render";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

// QR generation + multi-photo compositing at 2560×1440 can take a bit.
export const maxDuration = 60;

/**
 * POST /api/tools/banner
 * Renders a banner (editable text, up to two QR codes, 0–2 photos) and
 * returns its URL. `platform` picks the canvas: "facebook" (1640×720 cover)
 * or "linkedin" (1584×396); anything else — including requests that don't
 * send it — is the 2560×1440 YouTube channel banner.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    platform?: string;
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
    };
    const result = isSocialPlatform(body.platform)
      ? await renderAndSaveSocialBanner({ ...fields, platform: body.platform })
      : await renderAndSaveBanner(fields);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[banner] Error:", err);
    const msg = err instanceof Error ? err.message : "Banner generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
