import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const MAX_USERS = 100;

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const admin = createAdminClient();

  // Check if we've hit the user cap
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true });

  if ((count ?? 0) > MAX_USERS) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/register?error=full`);
  }

  // Route returning users based on onboarding and subscription status
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_done, subscription_tier, credits_remaining")
      .eq("id", user.id)
      .single();

    if (profile?.onboarding_done) {
      const tier = profile.subscription_tier ?? "free";
      const paidPlans = ["starter", "agent", "pro"];
      // Beta users go to billing once they've used their 1 free video
      const isBetaExhausted = tier === "beta" && (profile.credits_remaining ?? 0) <= 0;
      const hasPaidAccess = paidPlans.includes(tier) || (tier === "beta" && !isBetaExhausted);
      return NextResponse.redirect(`${origin}${hasPaidAccess ? "/create" : "/billing"}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
