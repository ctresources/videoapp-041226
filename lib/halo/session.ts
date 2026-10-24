import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autopilotEligible } from "@/lib/autopilot";
import { HALO_PROFILE_SELECT, type HaloProfile } from "@/lib/halo";

/**
 * The signed-in agent for the Halo routes, with their profile, or the
 * response to send instead. Halo videos come with AutoSparks: paid plans and
 * admins.
 */
export async function haloSession(): Promise<
  | { ok: true; user: { id: string; email: string | null }; profile: HaloProfile; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select(HALO_PROFILE_SELECT).eq("id", user.id).single();
  const profile = data as HaloProfile | null;
  if (!profile) return { ok: false, response: NextResponse.json({ error: "Profile not found." }, { status: 400 }) };
  if (!autopilotEligible(profile)) {
    return { ok: false, response: NextResponse.json({ error: "Halo videos are part of the paid plans.", code: "paid_only" }, { status: 403 }) };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null }, profile, admin };
}
