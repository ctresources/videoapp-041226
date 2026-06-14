import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/beta", "/auth/callback", "/forgot-password", "/reset-password", "/privacy", "/terms"];
const AUTH_ROUTES = ["/login", "/register", "/", "/beta"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth — skip session check to avoid redirect loops
  // and ensure they return proper JSON error responses instead of redirect HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

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
      .select("onboarding_done, subscription_tier, credits_remaining, role")
      .eq("id", user.id)
      .single();

    if (!profile?.onboarding_done) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (profile.role === "admin") {
      return NextResponse.redirect(new URL("/create", request.url));
    }

    const tier = profile.subscription_tier ?? "free";
    const paidPlans = ["starter", "agent", "pro"];
    const isBetaExhausted = tier === "beta" && (profile.credits_remaining ?? 0) <= 0;
    const hasPaidAccess = paidPlans.includes(tier) || (tier === "beta" && !isBetaExhausted);
    return NextResponse.redirect(new URL(hasPaidAccess ? "/create" : "/billing", request.url));
  }

  // Unauthenticated users on protected routes → login
  if (!user && !PUBLIC_ROUTES.some((r) => pathname === r)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
