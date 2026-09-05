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
    .single();

  if (!invite) return NextResponse.json({ error: "Invalid invite code." }, { status: 400 });

  const inv = invite as { id: string; credits: number; expires_at: string | null; max_uses: number; uses_count: number };

  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite code has expired." }, { status: 400 });
  }

  if (inv.uses_count >= inv.max_uses) {
    return NextResponse.json({ error: "This invite code has reached its usage limit." }, { status: 400 });
  }

  // A code ADDS videos; it does not replace what you already have.
  //
  // This used to SET both the tier and the balance. A paying customer who
  // redeemed a code was moved to tier "beta" — which no plan matches, so the
  // renewal handler never refilled them again — and had their remaining
  // videos overwritten with the code's. They kept being charged and stopped
  // receiving anything for it.
  //
  // The tier now only moves for someone on "free", who has no plan to lose.
  const { data: current } = await admin
    .from("profiles")
    .select("subscription_tier, credits_remaining")
    .eq("id", user.id)
    .single();
  const cur = (current ?? {}) as { subscription_tier?: string | null; credits_remaining?: number | null };
  const onFreeTier = !cur.subscription_tier || cur.subscription_tier === "free";

  await Promise.all([
    admin.from("beta_invites").update({ uses_count: inv.uses_count + 1, used_by: user.id, used_at: new Date().toISOString() }).eq("id", inv.id),
    admin.from("profiles").update({
      ...(onFreeTier && { subscription_tier: "beta" }),
      credits_remaining: (cur.credits_remaining ?? 0) + inv.credits,
    }).eq("id", user.id),
  ]);

  return NextResponse.json({ ok: true, credits: inv.credits });
}
