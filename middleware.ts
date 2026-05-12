import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register"];
const AUTH_ROUTES = ["/login", "/register"];
const ADMIN_ROUTES = ["/admin"];

/**
 * Decode the Supabase session from cookies without any network call.
 * @supabase/ssr stores the session as a JSON-encoded string in a cookie
 * named `sb-<project-ref>-auth-token` (may be chunked into .0, .1, etc.).
 * We only need the sub (user ID) for routing — actual security validation
 * happens in server components and API routes via supabase.auth.getUser().
 */
function getUserFromCookies(request: NextRequest): { id: string } | null {
  try {
    // Collect all auth-token cookie chunks and join them
    const chunks = request.cookies
      .getAll()
      .filter((c) => c.name.match(/sb-.*-auth-token/))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.value);

    if (chunks.length === 0) return null;

    const raw = chunks.join("");
    const parsed = JSON.parse(decodeURIComponent(raw));

    // Value may be the session object directly or an array [accessToken, ...]
    const accessToken: string | null =
      typeof parsed === "string"
        ? parsed
        : parsed?.access_token ?? (Array.isArray(parsed) ? parsed[0] : null);

    if (!accessToken) return null;

    // Decode JWT payload (base64url) — no signature verification needed for routing
    const payloadB64 = accessToken.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

    const sub: string | undefined = payload?.sub;
    if (!sub) return null;

    // Check token hasn't expired
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { id: sub };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = getUserFromCookies(request);

  // Logged-in users visiting auth pages → redirect to dashboard
  if (user && AUTH_ROUTES.some((r) => pathname === r)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes — must be authenticated
  if (
    !user &&
    !PUBLIC_ROUTES.some((r) => pathname === r) &&
    !pathname.startsWith("/api/video/webhook")
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin route role check is handled in the admin layout (server component)
  // to avoid a DB round-trip on every request.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
