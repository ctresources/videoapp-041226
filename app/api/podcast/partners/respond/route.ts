import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitationFor, respondToInvite } from "@/lib/podcast/partners";

export const dynamic = "force-dynamic";

/**
 * The invited person's side (2026-11-02). Any signed-in account; it has to be
 * the email the invitation went to.
 * GET  ?t=token — who is asking, and whether it's already answered.
 * POST { t, allow } — Allow, or No thanks.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inv = await invitationFor(createAdminClient(), req.nextUrl.searchParams.get("t") ?? "");
  if (!inv) return NextResponse.json({ error: "This invitation link isn't valid any more." }, { status: 404 });
  const r = inv.row;
  const mine = r.partner_id === user.id || (!!user.email && r.partner_email.toLowerCase() === user.email.toLowerCase());
  const { data: prof } = await createAdminClient().from("profiles")
    .select("heygen_digital_twin_look_id, twin_consent_needed, heygen_voice_id, voice_sample_url").eq("id", user.id).single();
  const p = prof as { heygen_digital_twin_look_id: string | null; twin_consent_needed: boolean | null; heygen_voice_id: string | null; voice_sample_url: string | null } | null;
  return NextResponse.json({
    hostName: inv.hostName, hostCompany: inv.hostCompany, role: r.role, status: r.status,
    sentTo: mine ? null : r.partner_email, id: r.id,
    hasTwin: !!p?.heygen_digital_twin_look_id && !p.twin_consent_needed, hasVoice: !!(p?.heygen_voice_id || p?.voice_sample_url),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { t?: string; allow?: boolean };
  const r = await respondToInvite(createAdminClient(), { id: user.id, email: user.email ?? null }, b.t ?? "", b.allow === true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
