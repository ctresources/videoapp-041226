import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPARKREELS_MODE } from "@/lib/sparkreels-mode";

export const dynamic = "force-dynamic";

/**
 * Admin → SparkReels mode (2026-11-01): which accounts promote SparkReels
 * instead of real estate (lib/sparkreels-mode.ts). Real admins only.
 *
 * GET              the accounts it's on for
 * POST { email, on }  turn it on or off for one account
 */
async function realAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (data as { role: string | null } | null)?.role === "admin";
}

export async function GET() {
  if (!(await realAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin.from("feature_access").select("user_id").eq("feature", SPARKREELS_MODE);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return NextResponse.json({ accounts: [] });
  const { data: profs } = await admin.from("profiles").select("id, email, full_name").in("id", ids);
  return NextResponse.json({ accounts: (profs ?? []) as { id: string; email: string; full_name: string | null }[] });
}

export async function POST(req: NextRequest) {
  if (!(await realAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { email, on } = (await req.json().catch(() => ({}))) as { email?: string; on?: boolean };
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return NextResponse.json({ error: "Enter the account's email." }, { status: 400 });
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id").ilike("email", e).maybeSingle();
  const id = (prof as { id: string } | null)?.id;
  if (!id) return NextResponse.json({ error: "No account with that email." }, { status: 404 });
  const { error } = on
    ? await admin.from("feature_access").upsert({ user_id: id, feature: SPARKREELS_MODE }, { onConflict: "user_id,feature", ignoreDuplicates: true })
    : await admin.from("feature_access").delete().eq("user_id", id).eq("feature", SPARKREELS_MODE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
