import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register"];
const AUTH_ROUTES = ["/login", "/register"];
const ADMIN_ROUTES = ["/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession reads from cookie — no network call, stays within middleware timeout
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // Logged-in users visiting auth pages → redirect to dashboard
  if (user && AUTH_ROUTES.some((r) => pathname === r)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes — must be authenticated
  if (!user && !PUBLIC_ROUTES.some((r) => pathname === r) && !pathname.startsWith("/api/video/webhook")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin routes — check role
  if (user && ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Onboarding check moved to /dashboard page (server component) to avoid
  // extra DB round-trip on every middleware invocation.

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
