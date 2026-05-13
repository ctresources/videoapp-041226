import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  // Capture auth cookie names before signOut (signOut may clear them from the store)
  const authCookieNames = cookieStore
    .getAll()
    .filter((c) => /^sb-/.test(c.name))
    .map((c) => c.name);

  const supabase = await createClient();
  await supabase.auth.signOut();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const response = NextResponse.redirect(`${appUrl}/login`, { status: 302 });

  // NextResponse.redirect() creates a new response — cookie-clearing headers
  // from signOut() don't transfer to it. Explicitly delete them here so the
  // middleware sees no auth cookie on the /login request.
  for (const name of authCookieNames) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}
