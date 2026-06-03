import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json() as { code: string };
  if (!code?.trim()) return NextResponse.json({ error: "Code is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("beta_invites")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .is("used_by", null)
    .single();

  if (!invite) return NextResponse.json({ error: "Invalid or already used invite code." }, { status: 400 });

  const inv = invite as { id: string; credits: number; expires_at: string | null };

  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite code has expired." }, { status: 400 });
  }

  // Mark code as used and upgrade profile to beta
  await Promise.all([
    admin.from("beta_invites").update({ used_by: user.id, used_at: new Date().toISOString() }).eq("id", inv.id),
    admin.from("profiles").update({ subscription_tier: "beta", credits_remaining: inv.credits }).eq("id", user.id),
  ]);

  return NextResponse.json({ ok: true, credits: inv.credits });
}
