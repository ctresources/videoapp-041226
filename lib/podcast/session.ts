import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/utils/feature-access";
import { PODCAST_FEATURE, podcastPlanOk } from "@/lib/podcast/podcast";

/** The signed-in agent, if Spark Podcast is switched on for them. */
export async function podcastSession(): Promise<
  | { ok: true; user: { id: string; email: string | null }; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasFeature(user.id, PODCAST_FEATURE))) {
    return { ok: false, response: NextResponse.json({ error: "Spark Podcast isn't on for your account yet." }, { status: 403 }) };
  }
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  if (!podcastPlanOk(prof as { subscription_tier: string | null; role: string | null } | null)) {
    return { ok: false, response: NextResponse.json({ error: "Spark Podcast comes with the Producer and Influencer plans.", code: "plan" }, { status: 403 }) };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null }, admin };
}
