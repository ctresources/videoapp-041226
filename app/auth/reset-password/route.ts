import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    // Cookies are collected and replayed onto the redirect, for the same reason
    // as app/auth/callback: writing them through next/headers did not reliably
    // reach a freshly-constructed redirect response, so the recovery session was
    // lost in transit and /reset-password saw a signed-out user.
    const pending: { name: string; value: string; options: CookieOptions }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              req.cookies.set(name, value);
              pending.push({ name, value, options: options ?? {} });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}/reset-password`);
      pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      return res;
    }
    console.error("[auth/reset-password] code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=reset_failed`);
}
