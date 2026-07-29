import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";

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
    .select(`${ALLOWANCE_SELECT}, subscription_tier, role`)
    .eq("id", user.id)
    .single();

  const profile = (data ?? {}) as Record<string, number | string | null>;
  const isAdmin = profile.role === "admin";

  return NextResponse.json({
    short: isAdmin ? 999 : availableFor(profile as never, "short"),
    long: isAdmin ? 999 : availableFor(profile as never, "long"),
    tier: (profile.subscription_tier as string) ?? "free",
    isAdmin,
  });
}
