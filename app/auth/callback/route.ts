import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { notifyNewUser } from "@/lib/email";
import { attributeReferral } from "@/lib/affiliate-attribution";
import { hasCapacityForNewUser, maybeNotifyCapacity } from "@/lib/capacity";
import { screenSignup, canonicalEmail } from "@/lib/spam-guards";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/create";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Session cookies are collected as the client writes them, then replayed onto
  // whichever redirect this route returns.
  //
  // This used to go through the shared server client, which sets cookies via
  // next/headers inside a try/catch. Those writes did not reliably reach the
  // freshly-constructed redirect response, so the browser followed it carrying
  // no session, middleware saw a signed-out user and sent it to /login — with
  // nothing to display, because the code exchange had actually succeeded. The
  // cookie landed a moment later, which is why a second attempt always worked
  // and made this look intermittent. Same pattern middleware.ts already uses.
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Keep the request in sync so later reads in this same request
            // (getUser below) see the session that was just established.
            req.cookies.set(name, value);
            pending.push({ name, value, options: options ?? {} });
          });
        },
      },
    }
  );

  /** Every exit from this route goes through here, so none can drop the session. */
  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(`${origin}${path}`);
    pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  };

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Logged because this is otherwise invisible: the user just sees the login
    // page again, and the reason never leaves the server.
    console.error("[auth/callback] code exchange failed:", error.message);
    return redirectTo("/login?error=auth_failed");
  }

  const admin = createAdminClient();

  // Capacity gate — only for people joining right now. Someone who already
  // has an account must never be turned away because the beta filled up after
  // they joined, so this is keyed on "was this account just created".
  const { data: { user } } = await supabase.auth.getUser();
  const isNew = !!user?.created_at && (Date.now() - new Date(user.created_at).getTime()) < 60_000;

  // Spam screening for Google signups. This path previously ran none at all,
  // and since /beta offered Google only, in practice almost every account
  // skipped the guard — which is how the dotted-Gmail addresses got in.
  // Rejected accounts are deleted, same as an over-capacity signup.
  if (user && isNew) {
    const displayName = (user.user_metadata?.full_name as string | null) ?? "";
    const reason = await screenSignup(admin, {
      name: displayName,
      email: user.email ?? "",
      excludeUserId: user.id, // their own row already exists
    });
    if (reason) {
      console.warn(`[auth/callback] Rejected Google signup ${user.email}: ${reason}`);
      await supabase.auth.signOut();
      await admin.from("profiles").delete().eq("id", user.id);
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      // /beta already surfaces query-string messages; /login ignores them.
      return redirectTo(`/beta?rejected=${encodeURIComponent(reason)}`);
    }
  }

  if (user && isNew && !(await hasCapacityForNewUser(admin, user.id))) {
    // Their auth user + profile row were already created by the code exchange,
    // so remove both — otherwise a rejected signup still counts against the cap.
    await supabase.auth.signOut();
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return redirectTo("/beta?full=1");
  }

  // Route returning users based on onboarding and subscription status
  if (user) {
    if (isNew) {
      const name = (user.user_metadata?.full_name as string | null) ?? null;
      // Deliberately not awaited, but the .catch() is load-bearing: an
      // unhandled rejection from this floating promise is fatal in Node >=15,
      // and killing the request here would skip the email_canonical write
      // below — leaving the signup guard blind to this inbox.
      notifyNewUser({ name, email: user.email ?? null, provider: "google" }).catch((err) =>
        console.error("[auth/callback] new-user notification failed:", err),
      );
      // Affiliate attribution from the sr_ref cookie set at ?ref= visit time.
      await attributeReferral(admin, user.id, user.email, req.cookies.get("sr_ref")?.value);
      await admin
        .from("profiles")
        .update({ email_canonical: canonicalEmail(user.email ?? "") })
        .eq("id", user.id);
      await maybeNotifyCapacity(admin);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_done, subscription_tier, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role")
      .eq("id", user.id)
      .single();

    // Admins always go straight to the app — no billing or onboarding check
    if (profile?.role === "admin") {
      return redirectTo("/create");
    }

    if (profile?.onboarding_done) {
      const tier = profile.subscription_tier ?? "free";
      const paidPlans = ["starter", "agent", "pro"];
      const hasCredits = (profile.credits_remaining ?? 0) > 0 || (profile.long_credits_remaining ?? 0) > 0 || (profile.purchased_short_videos ?? 0) > 0 || (profile.purchased_long_videos ?? 0) > 0;
      const hasPaidAccess = paidPlans.includes(tier) || hasCredits;
      return redirectTo(hasPaidAccess ? "/create" : "/billing");
    }
  }

  return redirectTo(next);
}
