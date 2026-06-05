import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// GET  /api/admin/invite-codes — list all codes
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: codes } = await admin
    .from("beta_invites")
    .select("*, profiles:used_by(email, full_name)")
    .order("created_at", { ascending: false });

  return NextResponse.json({ codes: codes ?? [] });
}

// POST /api/admin/invite-codes — generate new code(s)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { count?: number; label?: string; credits?: number; expiresInDays?: number; customCode?: string; maxUses?: number };
  const credits = body.credits ?? 1;
  const label = body.label ?? null;
  const maxUses = body.maxUses ?? 1;
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400000).toISOString()
    : null;

  // Custom code: single row with specified name and max_uses
  if (body.customCode?.trim()) {
    const code = body.customCode.trim().toUpperCase().replace(/\s+/g, "-");
    const rows = [{ code, label, credits, max_uses: maxUses, expires_at: expiresAt }];
    const { data, error } = await admin.from("beta_invites").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ codes: data });
  }

  const count = Math.min(body.count ?? 1, 50);
  const rows = Array.from({ length: count }, () => ({
    code: `BETA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    label,
    credits,
    max_uses: 1,
    expires_at: expiresAt,
  }));

  const { data, error } = await admin.from("beta_invites").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ codes: data });
}

// DELETE /api/admin/invite-codes — delete a code
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json() as { id: string };
  await admin.from("beta_invites").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
