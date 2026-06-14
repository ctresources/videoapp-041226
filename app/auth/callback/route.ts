import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const MAX_USERS = 100;

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const admin = createAdminClient();

  // Check if we've hit the user cap
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true });

  if ((count ?? 0) > MAX_USERS) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/register?error=full`);
  }

  // Skip onboarding for returning users who already completed it
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_done")
      .eq("id", user.id)
      .single();

    if (profile?.onboarding_done) {
      return NextResponse.redirect(`${origin}/create`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
