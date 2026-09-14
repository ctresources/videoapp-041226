import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { freeTrialLocked } from "@/lib/utils/free-trial";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";

/**
 * The caller's remaining short/long videos.
 *
 * Lets the create screen say "you're out" BEFORE someone fills in a topic,
 * records audio and picks a style — rather than only after they press
 * Generate and get a 402 back.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("profiles")
    .select(`${ALLOWANCE_SELECT}, subscription_tier, role, first_video_generated_at`)
    .eq("id", user.id)
    .single();

  const profile = (data ?? {}) as Record<string, number | string | null>;
  const isAdmin = profile.role === "admin";

  /**
   * Whether this account can open the Spark Calendar yet.
   *
   * Reported here so the sidebar can point its Spark Calendar entry at the new
   * page for the people who have it and leave everyone else on the old one.
   * Without it the nav would have to guess, and guessing wrong means a working
   * menu item that returns 404 — which is what pointing it unconditionally
   * would have done to every account except the two holding the grant.
   *
   * Its own lookup rather than part of the profiles select above: grants live
   * in feature_access and are readable only by the service role, so hasFeature
   * uses the admin client while this route uses the caller's session.
   */
  const campaignCalendar = await hasFeature(user.id, CAMPAIGN_CALENDAR);

  // Admins are genuinely uncapped (create-blog neither refuses nor charges
  // them), so report that as a flag rather than inventing a big number — a
  // fake 999 is just a different way of showing something untrue.
  return NextResponse.json({
    unlimited: isAdmin,
    short: availableFor(profile as never, "short"),
    long: availableFor(profile as never, "long"),
    tier: (profile.subscription_tier as string) ?? "free",
    isAdmin,
    campaignCalendar,
    // So the Create screen can mark the Blog post tile locked BEFORE someone
    // picks it, waits a minute for a script, and lands on a Share Kit with no
    // article in it and nothing saying why.
    trialLocked: !isAdmin && freeTrialLocked(
      profile.first_video_generated_at as string | null,
      profile.subscription_tier as string | null,
    ),
  });
}
