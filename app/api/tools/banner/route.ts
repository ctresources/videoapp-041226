import { createClient } from "@/lib/supabase/server";
import { renderAndSaveBanner } from "@/lib/utils/banner-render";
import { NextRequest, NextResponse } from "next/server";

// QR generation + multi-photo compositing at 2560×1440 can take a bit.
export const maxDuration = 60;

/**
 * POST /api/tools/banner
 * Renders a 2560×1440 YouTube channel banner from the template
 * (editable text, up to two QR codes, 0–2 photos) and returns its URL.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    headline?: string;
    qr1Caption?: string;
    qr1Link?: string;
    subscribeKicker?: string;
    subscribeMain?: string;
    subscribeSub?: string;
    qr2Caption?: string;
    qr2Link?: string;
    photoUrls?: string[];
  };

  try {
    const result = await renderAndSaveBanner({
      userId: user.id,
      headline: body.headline,
      qr1Caption: body.qr1Caption,
      qr1Link: body.qr1Link,
      subscribeKicker: body.subscribeKicker,
      subscribeMain: body.subscribeMain,
      subscribeSub: body.subscribeSub,
      qr2Caption: body.qr2Caption,
      qr2Link: body.qr2Link,
      photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[banner] Error:", err);
    const msg = err instanceof Error ? err.message : "Banner generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
