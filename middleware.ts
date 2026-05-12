import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register"];
const AUTH_ROUTES = ["/login", "/register"];

/**
 * Check authentication purely from cookie presence — zero network calls.
 * @supabase/ssr stores the session in a cookie named sb-<ref>-auth-token
 * (may be chunked into .0, .1 etc for large values).
 * Pages and API routes still call supabase.auth.getUser() for real verification.
 */
function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /sb-.*-auth-token/.test(c.name));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = isAuthenticated(request);

  // Logged-in users visiting auth pages → redirect to dashboard
  if (authenticated && AUTH_ROUTES.some((r) => pathname === r)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes — must be authenticated
  if (
    !authenticated &&
    !PUBLIC_ROUTES.some((r) => pathname === r) &&
    !pathname.startsWith("/api/video/webhook")
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin role check is handled in app/(admin)/layout.tsx (server component).
  // Onboarding check is handled in app/(dashboard)/dashboard/page.tsx.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
