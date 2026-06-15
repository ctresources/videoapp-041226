import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { notifyNewUser } from "@/lib/email";

const MAX_USERS = 100;

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/create";

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
    // Notify on new Google OAuth signups (created within the last 60 seconds)
    const isNew = user.created_at && (Date.now() - new Date(user.created_at).getTime()) < 60_000;
    if (isNew) {
      const name = (user.user_metadata?.full_name as string | null) ?? null;
      notifyNewUser({ name, email: user.email ?? null, provider: "google" });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_done, subscription_tier, credits_remaining, role")
      .eq("id", user.id)
      .single();

    // Admins always go straight to the app — no billing or onboarding check
    if (profile?.role === "admin") {
      return NextResponse.redirect(`${origin}/create`);
    }

    if (profile?.onboarding_done) {
      const tier = profile.subscription_tier ?? "free";
      const paidPlans = ["starter", "agent", "pro"];
      const hasCredits = (profile.credits_remaining ?? 0) > 0;
      const hasPaidAccess = paidPlans.includes(tier) || hasCredits;
      return NextResponse.redirect(`${origin}${hasPaidAccess ? "/create" : "/billing"}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
