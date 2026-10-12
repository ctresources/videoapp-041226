import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialPublishError, accountPlan, profileUsage, uploadPostConfigured } from "@/lib/api/upload-post";

export const dynamic = "force-dynamic";

/**
 * How full the publishing plan is, for the admin panel.
 *
 * Each customer who connects an account takes one slot, and at the cap the
 * next one is refused outright. The only warning was an email from the
 * partner at 80%; this puts the number where the owner already looks.
 *
 * `ours` is our own count of accounts holding a slot, shown beside the
 * partner's so a difference between the two is visible rather than assumed.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!uploadPostConfigured()) return NextResponse.json({ configured: false });

  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("social_profile_created_at", "is", null);

  try {
    const [usage, plan] = await Promise.all([profileUsage(), accountPlan().catch(() => null)]);
    return NextResponse.json({ configured: true, reachable: true, used: usage.used, limit: usage.limit, plan, ours: count ?? 0 });
  } catch (err) {
    console.error("[admin/social-status]", err instanceof SocialPublishError ? err.raw ?? err.message : err);
    // 401 from the partner means the key itself was refused.
    const keyRefused = err instanceof SocialPublishError && err.status === 401;
    return NextResponse.json({ configured: true, reachable: false, keyRefused, ours: count ?? 0 });
  }
}
