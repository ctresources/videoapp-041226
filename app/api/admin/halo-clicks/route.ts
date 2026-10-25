import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin → Halo (2026-10-24, the owner's ask): everyone who pressed Get Halo,
 * one row per agent, with what she needs to find them on her Halo dashboard
 * (name, email, phone) and whose link they got.
 *
 * GET  — the rows, newest press first.
 * POST — { userId, signedUp } marks an agent as signed up on Halo (or not).
 */
async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (profile as { role: string } | null)?.role === "admin" ? user : null;
}

export async function GET() {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data: clicks } = await admin
    .from("halo_get_clicks")
    .select("user_id, affiliate_id, link, signed_up_at, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows = (clicks ?? []) as { user_id: string; affiliate_id: string | null; link: string; signed_up_at: string | null; created_at: string }[];

  const byUser = new Map<string, { userId: string; clicks: number; first: string; last: string; link: string; affiliateId: string | null; signedUpAt: string | null }>();
  for (const c of rows) {
    const u = byUser.get(c.user_id);
    if (!u) byUser.set(c.user_id, { userId: c.user_id, clicks: 1, first: c.created_at, last: c.created_at, link: c.link, affiliateId: c.affiliate_id, signedUpAt: c.signed_up_at });
    else { u.clicks++; u.first = c.created_at; if (c.signed_up_at && !u.signedUpAt) u.signedUpAt = c.signed_up_at; }
  }
  const ids = Array.from(byUser.keys());
  const affIds = Array.from(new Set(Array.from(byUser.values()).map((u) => u.affiliateId).filter((x): x is string => !!x)));
  const [{ data: profs }, { data: affs }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id, full_name, email, mobile_phone, phone, subscription_tier").in("id", ids) : Promise.resolve({ data: [] }),
    affIds.length ? admin.from("affiliates").select("id, full_name").in("id", affIds) : Promise.resolve({ data: [] }),
  ]);
  const p = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string; mobile_phone: string | null; phone: string | null; subscription_tier: string | null }[]).map((x) => [x.id, x]));
  const a = new Map(((affs ?? []) as { id: string; full_name: string | null }[]).map((x) => [x.id, x.full_name]));

  return NextResponse.json({
    agents: Array.from(byUser.values()).map((u) => {
      const pr = p.get(u.userId);
      return {
        userId: u.userId,
        name: pr?.full_name ?? null,
        email: pr?.email ?? "",
        phone: pr?.mobile_phone || pr?.phone || null,
        plan: pr?.subscription_tier ?? null,
        clicks: u.clicks,
        firstAt: u.first,
        lastAt: u.last,
        link: u.link,
        whose: u.affiliateId ? (a.get(u.affiliateId) ?? "An affiliate") : "Yours",
        signedUpAt: u.signedUpAt,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId, signedUp } = (await req.json().catch(() => ({}))) as { userId?: string; signedUp?: boolean };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const at = signedUp ? new Date().toISOString() : null;
  const { error } = await createAdminClient().from("halo_get_clicks").update({ signed_up_at: at }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  return NextResponse.json({ signedUpAt: at });
}
