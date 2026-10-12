import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SocialPublishError, getDestinations, profileUsername, setDestination, uploadPostConfigured,
  type DestinationPlatform, type Destinations,
} from "@/lib/api/upload-post";

export const dynamic = "force-dynamic";

/**
 * Where a platform's posts go, for the three that can have more than one
 * place: a Facebook account can manage several Pages, a LinkedIn account has
 * a personal profile and any company pages it runs, and a Google account can
 * hold several business locations.
 *
 * Nothing was chosen anywhere before this. That is fine with one Page, which
 * is used automatically, and a refusal at posting time with two. The choice is
 * kept with the publishing partner, against the agent's own profile, and is
 * then used for every post, scheduled ones included.
 *
 * The profile addressed is always derived from the signed-in user, never taken
 * from the request, so one account cannot read or set another's.
 */
const PLATFORMS: DestinationPlatform[] = ["facebook", "linkedin", "google_business"];
const isPlatform = (p: unknown): p is DestinationPlatform => PLATFORMS.includes(p as DestinationPlatform);

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("social_profile_created_at").eq("id", user.id).maybeSingle();
  const created = !!(data as { social_profile_created_at: string | null } | null)?.social_profile_created_at;
  return { user, created };
}

// GET ?platforms=facebook,linkedin — the choices and the current one, per platform.
export async function GET(req: NextRequest) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uploadPostConfigured() || !me.created) return NextResponse.json({ destinations: {} });

  const asked = (req.nextUrl.searchParams.get("platforms") ?? "").split(",").filter(isPlatform);
  const username = profileUsername(me.user.id);
  const destinations: Partial<Record<DestinationPlatform, Destinations>> = {};
  await Promise.all(asked.map(async (platform) => {
    try {
      destinations[platform] = await getDestinations(username, platform);
    } catch (err) {
      // Left out rather than failed: the rest of the settings page does not
      // depend on this, and a missing picker is better than a broken page.
      console.error(`[social/destinations] ${platform}:`, err instanceof SocialPublishError ? err.raw ?? err.message : err);
    }
  }));
  return NextResponse.json({ destinations });
}

// POST { platform, id } — choose one. id null clears it (LinkedIn: back to the personal profile).
export async function POST(req: NextRequest) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uploadPostConfigured() || !me.created) {
    return NextResponse.json({ error: "Connect your accounts first." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { platform?: unknown; id?: unknown };
  if (!isPlatform(body.platform)) return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
  const platform = body.platform;
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const username = profileUsername(me.user.id);

  try {
    // Only something the account itself was offered can be chosen.
    if (id) {
      const current = await getDestinations(username, platform);
      if (!current.options.some((o) => o.id === id)) {
        return NextResponse.json({ error: "That isn't one of your options. Refresh the page and choose again." }, { status: 400 });
      }
    }
    await setDestination(username, platform, id);
    return NextResponse.json({ success: true, destination: await getDestinations(username, platform) });
  } catch (err) {
    console.error(`[social/destinations] set ${platform}:`, err instanceof SocialPublishError ? err.raw ?? err.message : err);
    return NextResponse.json({ error: "That couldn't be saved. Try again in a moment." }, { status: 502 });
  }
}
