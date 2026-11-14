import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { townLimit } from "@/lib/ai-visibility/shared";

export interface AiVisProfile {
  id: string; full_name: string | null; role: string | null; subscription_tier: string | null;
  location_city: string | null; location_state: string | null;
}

/** The signed-in paid agent, or the response to send instead. */
export async function aiVisibilitySession(): Promise<
  | { ok: true; admin: ReturnType<typeof createAdminClient>; profile: AiVisProfile; limit: number }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from("profiles")
    .select("id, full_name, role, subscription_tier, location_city, location_state")
    .eq("id", user.id).single();
  const profile = data as AiVisProfile | null;
  if (!profile) return { ok: false, response: NextResponse.json({ error: "Profile not found." }, { status: 400 }) };
  const level = getAccessLevel(profile);
  if (!isPaidLevel(level)) {
    return { ok: false, response: NextResponse.json({ error: "This comes with a SparkReels plan.", code: "paid_plan_required" }, { status: 403 }) };
  }
  return { ok: true, admin, profile, limit: townLimit(level) };
}

/** "blue bell" → "Blue Bell"; "pa" → "PA". */
export function cleanTown(town: unknown, state: unknown): { town: string; state: string } | null {
  const t = typeof town === "string" ? town.trim().replace(/\s+/g, " ").replace(/,.*$/, "").slice(0, 60) : "";
  const s = typeof state === "string" ? state.trim().toUpperCase() : "";
  if (t.length < 2 || !/^[A-Z]{2}$/.test(s)) return null;
  return { town: t.replace(/\b\w/g, (c) => c.toUpperCase()), state: s };
}
