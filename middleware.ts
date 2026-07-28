import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/beta", "/auth/callback", "/forgot-password", "/reset-password", "/privacy", "/terms", "/affiliates/apply"];
const AUTH_ROUTES = ["/login", "/register", "/", "/beta"];

// 60-day last-click attribution window for affiliate referrals.
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth — skip session check to avoid redirect loops
  // and ensure they return proper JSON error responses instead of redirect HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ── Affiliate referral capture ────────────────────────────────────────────
  // A `?ref=CODE` on any page (typically the marketing home page) is validated
  // against approved affiliates; if real, we log a click and set a 60-day
  // last-click cookie. Validation avoids cookie-ing junk/typo codes. All of
  // this is gated behind the presence of `ref`, so normal requests pay nothing.
  const ref = request.nextUrl.searchParams.get("ref");
  let refCodeToSet: string | null = null;
  if (ref && /^[A-Za-z0-9]{4,24}$/.test(ref)) {
    try {
      const admin = createAdminClient();
      const { data: aff } = await admin
        .from("affiliates")
        .select("id")
        .eq("ref_code", ref.toUpperCase())
        .eq("status", "approved")
        .maybeSingle();
      if (aff) {
        refCodeToSet = ref.toUpperCase();
        await admin.from("affiliate_clicks").insert({
          affiliate_id: (aff as { id: string }).id,
          landing_path: pathname,
          referrer: request.headers.get("referer") || null,
          user_agent: request.headers.get("user-agent") || null,
        });
      }
    } catch {
      // Attribution is best-effort — never let it break a page load.
    }
  }

  // Applies the sr_ref cookie to whichever response we ultimately return.
  const applyRef = (res: NextResponse): NextResponse => {
    if (refCodeToSet) {
      res.cookies.set("sr_ref", refCodeToSet, {
        maxAge: REF_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
        httpOnly: false, // the register page reads it via document.cookie
      });
    }
    return res;
  };

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate session server-side — cookie presence alone is not enough.
  // After signOut(), getUser() returns null even if stale cookies remain.
  const { data: { user } } = await supabase.auth.getUser();

  // Authenticated users visiting public/auth pages → route based on profile status
  if (user && AUTH_ROUTES.some((r) => pathname === r)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_done, subscription_tier, credits_remaining, long_credits_remaining, role")
      .eq("id", user.id)
      .single();

    if (!profile?.onboarding_done) {
      return applyRef(NextResponse.redirect(new URL("/create", request.url)));
    }

    if (profile.role === "admin") {
      return applyRef(NextResponse.redirect(new URL("/create", request.url)));
    }

    const tier = profile.subscription_tier ?? "free";
    const paidPlans = ["starter", "agent", "pro"];
    const hasCredits = (profile.credits_remaining ?? 0) > 0 || (profile.long_credits_remaining ?? 0) > 0;
    const hasPaidAccess = paidPlans.includes(tier) || hasCredits;
    return applyRef(NextResponse.redirect(new URL(hasPaidAccess ? "/create" : "/billing", request.url)));
  }

  // Unauthenticated users on protected routes → login
  if (!user && !PUBLIC_ROUTES.some((r) => pathname === r)) {
    return applyRef(NextResponse.redirect(new URL("/login", request.url)));
  }

  return applyRef(supabaseResponse);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
