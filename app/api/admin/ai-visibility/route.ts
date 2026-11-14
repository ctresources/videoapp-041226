import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOWN_SELECT, type TownRow } from "@/lib/ai-visibility/run";
import { recentChecks, summarizeTown } from "@/lib/ai-visibility/summary";
import type { TownQuestion } from "@/lib/ai-visibility/shared";

export const dynamic = "force-dynamic";

const PLAN: Record<string, string> = { starter: "Creator", agent: "Producer", pro: "Influencer", agency: "Influencer" };

/**
 * GET /api/admin/ai-visibility — Admin → AI Visibility (2026-11-14, the
 * owner's approved mockup): every agent's towns with this week's score and
 * the change from last week, highest first.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role: string } | null)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data } = await admin.from("ai_visibility_towns").select(TOWN_SELECT).limit(2000);
  const towns = (data ?? []) as (TownRow & { last_checked_at: string | null; status: string | null })[];
  const rows = await recentChecks(admin, towns.map((t) => t.id));
  const ids = Array.from(new Set(towns.map((t) => t.user_id)));
  const { data: profs } = ids.length
    ? await admin.from("profiles").select("id, full_name, email, role, subscription_tier").in("id", ids)
    : { data: [] };
  const who = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null; subscription_tier: string | null }[])
    .map((p) => [p.id, p]));

  const agents = towns.map((t) => {
    const p = who.get(t.user_id);
    const s = summarizeTown({ ...t, questions: (t.questions ?? []) as TownQuestion[] }, rows);
    return {
      userId: t.user_id,
      name: p?.full_name || p?.email || "(no name)",
      plan: p?.role === "admin" ? "Admin" : p?.role === "staff" ? "Staff" : PLAN[p?.subscription_tier ?? ""] ?? "Free",
      ...s,
    };
  }).sort((a, b) => b.named + b.cited - (a.named + a.cited));
  return NextResponse.json({ agents });
}
