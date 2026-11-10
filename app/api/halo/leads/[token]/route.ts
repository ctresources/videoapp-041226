import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { readLead, sanitizeLeadSettings, saveLead, signatureMatches, startNewLead } from "@/lib/halo/leads";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Halo's "Send to my CRM → Custom webhook" (2026-11-09): Halo POSTs each new
 * lead here as JSON. The link itself is the agent's secret; when Halo also
 * signs the body (X-Halo-Signature, HMAC-SHA256 with the secret from
 * Settings), a wrong signature is refused. Nothing is written or made here:
 * the lead gets a card on AutoSparks and waits for the agent.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles")
    .select("id, email, role, subscription_tier, halo_leads, halo_leads_secret_enc")
    .eq("halo_leads_token", token).maybeSingle();
  const p = prof as { id: string; email: string | null; role: string | null; subscription_tier: string | null; halo_leads: unknown; halo_leads_secret_enc: string | null } | null;
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sig = req.headers.get("x-halo-signature");
  const secret = decryptToken(p.halo_leads_secret_enc);
  if (sig && secret && !signatureMatches(body, secret, sig)) {
    return NextResponse.json({ error: "Signature doesn't match" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "Expected JSON" }, { status: 400 }); }
  const lead = readLead(payload);
  const settings = sanitizeLeadSettings(p.halo_leads);
  const now = new Date().toISOString();

  // Halo's "Connect and send a test", or anything with nobody to reply to.
  if (lead.test || (!lead.email && !lead.phone)) {
    await admin.from("profiles").update({ halo_leads: { ...settings, lastTestAt: now } }).eq("id", p.id);
    return NextResponse.json({ ok: true, test: true });
  }
  await admin.from("profiles").update({ halo_leads: { ...settings, lastLeadAt: now } }).eq("id", p.id);

  // Halo's own spam filter, a switched-off link, or a plan without it: kept quiet.
  if (lead.filtered || !settings.enabled || !isPaidLevel(getAccessLevel(p))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const { lead: row, merged } = await saveLead(admin, p.id, lead, payload);
    if (!merged) waitUntil(startNewLead(admin, p.id, row).catch((err) => {
      console.error("[halo-leads] start:", err instanceof Error ? err.message : err);
    }));
    return NextResponse.json({ ok: true, id: row.id, merged });
  } catch (err) {
    console.error("[halo-leads] save:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save the lead" }, { status: 500 });
  }
}
