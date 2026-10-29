import { hasAdminPerks } from "@/lib/utils/roles";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublicMarketingPath } from "@/lib/seo/public-pages";
import { getAccessLevel, isPaidLevel } from "@/lib/access";

// "/auth/reset-password" is the route handler the reset EMAIL links to, and it
// is not the same path as "/reset-password", the page. Only the page was
// listed, so every reset link redirected the one person who cannot sign in —
// the one holding it — to /login, with no error and no way through.
const PUBLIC_ROUTES = ["/", "/login", "/register", "/beta", "/auth/callback", "/auth/reset-password", "/forgot-password", "/reset-password", "/privacy", "/terms", "/affiliates/apply"];
const AUTH_ROUTES = ["/login", "/register", "/", "/beta"];
/**
 * Public: the routes above, plus the feature pages, pricing, FAQ and blog
 * (2026-10-22). Signed-in people can read those too, without being sent to
 * the app the way "/" sends them.
 */
const isPublic = (pathname: string) =>
  PUBLIC_ROUTES.some((r) => pathname === r) || isPublicMarketingPath(pathname);

// 60-day last-click attribution window for affiliate referrals.
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

/**
 * Paid-workflow actions a free account may not take (2026-10-28), so the
 * locked pages can't be got around by calling their APIs directly. Writes
 * only: reading and DELETE stay open, so an account that has dropped to free
 * can still see and disconnect what it set up. Not /api/halo/draft or
 * /api/halo/approve: Sparklee's drafts on Create use them on every plan.
 */
const PAID_API_WRITES = [
  "/api/integrations/boldtrail", // connect BoldTrail
  "/api/boldtrail",              // BoldTrail contacts and sends (Share Kit email, 2026-10-29)
  "/api/crm/webhooks",           // GoHighLevel and other webhooks
  "/api/support/ghl-workflow",   // ask for the GoHighLevel workflow
  "/api/halo/sites",             // add a Halo site
  "/api/halo/promo",             // Halo referral promo video
  "/api/autopilot",              // AutoSparks: Ask for ideas
  "/api/seller-auto",            // seller updates on AutoSparks
  "/api/video-email/send",       // Email it
  "/api/seller-listings",        // Seller Update (Spark Tools)
  "/api/review-request",         // Ask for Google Review Video Email
  "/api/tools/google-reviews",   // Google Reviews: draft and post replies
  // The affiliate routes check isAffiliateEligible themselves: a canceled
  // subscriber keeps access until their paid period ends.
];

async function refusePaidApiForFree(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "DELETE") return null;
  if (!PAID_API_WRITES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // the route itself answers 401
  const { data } = await supabase.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  const level = getAccessLevel((data as { subscription_tier: string | null; role: string | null } | null) ?? {});
  if (isPaidLevel(level)) return null;
  return NextResponse.json(
    { error: "This comes with a SparkReels plan. See plans in Settings → Billing.", code: "paid_plan_required" },
    { status: 403 },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth — skip session check to avoid redirect loops
  // and ensure they return proper JSON error responses instead of redirect HTML.
  if (pathname.startsWith("/api/")) {
    const refused = await refusePaidApiForFree(request);
    if (refused) return refused;
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
  /**
   * A suspended account is signed out and kept out.
   *
   * Suspension used to be the string "suspended" written into role, and no
   * route, page or middleware branch ever read it — so the admin's Suspend
   * button changed a value nothing consulted and locked nobody out of
   * anything. It has its own column now, and this is the check that makes
   * the button mean what it says.
   *
   * Only on protected routes: a suspended user must still reach /login to
   * see why, and the public pages are public.
   */
  if (user && !isPublic(pathname)) {
    const { data: suspensionRow } = await supabase
      .from("profiles")
      .select("suspended")
      .eq("id", user.id)
      .single();
    if ((suspensionRow as { suspended?: boolean } | null)?.suspended) {
      await supabase.auth.signOut();
      return applyRef(NextResponse.redirect(new URL("/login?error=suspended", request.url)));
    }
  }

  /**
   * Un-onboarded users are pulled into the first-run flow from anywhere in the
   * app, not only from the auth routes — otherwise someone who lands on
   * /create directly (which is where login sends them) never sees it.
   *
   * /onboarding itself is excluded for the obvious reason, and so is /settings,
   * because "everything here can be changed later in Settings" has to be true.
   */
  const FIRST_RUN_EXEMPT = ["/onboarding", "/settings", "/billing"];
  if (
    user
    && !isPublic(pathname)
    && !FIRST_RUN_EXEMPT.some((r) => pathname.startsWith(r))
    && !pathname.startsWith("/api")
  ) {
    const { data: onboardingRow } = await supabase
      .from("profiles")
      .select("onboarding_done, onboarding_skipped_at")
      .eq("id", user.id)
      .single();
    // "Finish later" (2026-10-23): someone who chose to leave setup is not
    // sent back to it; Spark Studio reminds them instead.
    const row = onboardingRow as { onboarding_done?: boolean; onboarding_skipped_at?: string | null } | null;
    if (row?.onboarding_done === false && !row.onboarding_skipped_at) {
      return applyRef(NextResponse.redirect(new URL("/onboarding", request.url)));
    }
  }

  if (user && AUTH_ROUTES.some((r) => pathname === r)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_done, onboarding_skipped_at, subscription_tier, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role")
      .eq("id", user.id)
      .single();

    // First run goes to first run. This used to send people to /create and
    // return, which short-circuited the paid check below for every account
    // that had not saved a brand profile — which was almost all of them.
    if (!profile?.onboarding_done && !profile?.onboarding_skipped_at) {
      return applyRef(NextResponse.redirect(new URL("/onboarding", request.url)));
    }

    if (hasAdminPerks(profile.role)) {
      return applyRef(NextResponse.redirect(new URL("/create", request.url)));
    }

    const tier = profile.subscription_tier ?? "free";
    const paidPlans = ["starter", "agent", "pro"];
    const hasCredits = (profile.credits_remaining ?? 0) > 0 || (profile.long_credits_remaining ?? 0) > 0 || (profile.purchased_short_videos ?? 0) > 0 || (profile.purchased_long_videos ?? 0) > 0;
    const hasPaidAccess = paidPlans.includes(tier) || hasCredits;
    return applyRef(NextResponse.redirect(new URL(hasPaidAccess ? "/create" : "/billing", request.url)));
  }

  // Unauthenticated users on protected routes → login
  if (!user && !isPublic(pathname)) {
    return applyRef(NextResponse.redirect(new URL("/login", request.url)));
  }

  return applyRef(supabaseResponse);
}

export const config = {
  // Video files are let through with the images. Without mp4 here the landing
  // page's own demo (/demo.mp4) was sent to /login for anyone signed out,
  // which is everyone the landing page is for.
  // The install manifest too: a browser fetches it without the visitor's
  // sign-in, so it was getting the login page and "Add to Home Screen" had
  // no name or icon to use.
  // sw.js too (2026-10-20): it must be served, not redirected, so a browser
  // still holding the June offline worker can fetch the one that removes it.
  // robots.txt and the sitemaps too (2026-10-22): crawlers have no sign-in,
  // and Search Console was being handed the login page instead of XML.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.json$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|sitemap-index\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
