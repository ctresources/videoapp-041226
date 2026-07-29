import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { notifyNewUser } from "@/lib/email";
import { attributeReferral } from "@/lib/affiliate-attribution";
import { hasCapacityForNewUser } from "@/lib/capacity";

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

  // Capacity gate — only for people joining right now. Someone who already
  // has an account must never be turned away because the beta filled up after
  // they joined, so this is keyed on "was this account just created".
  const { data: { user } } = await supabase.auth.getUser();
  const isNew = !!user?.created_at && (Date.now() - new Date(user.created_at).getTime()) < 60_000;

  if (user && isNew && !(await hasCapacityForNewUser(admin, user.id))) {
    // Their auth user + profile row were already created by the code exchange,
    // so remove both — otherwise a rejected signup still counts against the cap.
    await supabase.auth.signOut();
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return NextResponse.redirect(`${origin}/beta?full=1`);
  }

  // Route returning users based on onboarding and subscription status
  if (user) {
    if (isNew) {
      const name = (user.user_metadata?.full_name as string | null) ?? null;
      notifyNewUser({ name, email: user.email ?? null, provider: "google" });
      // Affiliate attribution from the sr_ref cookie set at ?ref= visit time.
      await attributeReferral(admin, user.id, user.email, req.cookies.get("sr_ref")?.value);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_done, subscription_tier, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role")
      .eq("id", user.id)
      .single();

    // Admins always go straight to the app — no billing or onboarding check
    if (profile?.role === "admin") {
      return NextResponse.redirect(`${origin}/create`);
    }

    if (profile?.onboarding_done) {
      const tier = profile.subscription_tier ?? "free";
      const paidPlans = ["starter", "agent", "pro"];
      const hasCredits = (profile.credits_remaining ?? 0) > 0 || (profile.long_credits_remaining ?? 0) > 0 || (profile.purchased_short_videos ?? 0) > 0 || (profile.purchased_long_videos ?? 0) > 0;
      const hasPaidAccess = paidPlans.includes(tier) || hasCredits;
      return NextResponse.redirect(`${origin}${hasPaidAccess ? "/create" : "/billing"}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
