import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { parseHaloLink } from "@/lib/halo/get-halo";
import { LEAD_COLS, ensureLeadLink, leadLinks, leadVideo, refreshLead, sanitizeLeadSettings, type LeadRow } from "@/lib/halo/leads";

export const dynamic = "force-dynamic";

const APP = "https://www.sparkreels.ai";

/**
 * Halo leads for Settings and AutoSparks (2026-11-09).
 *
 * GET: the agent's link and secret for Halo, their choices, and the leads to
 * show (open ones, and those sent in the last week), each with its video.
 * POST { enabled?, buyer?, business?, haloLink?, bookingUrl? }: saves choices.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, subscription_tier, halo_leads").eq("id", user.id).single();
  const p = prof as { role: string | null; subscription_tier: string | null; halo_leads: unknown } | null;
  if (!isPaidLevel(getAccessLevel(p))) return NextResponse.json({ paidOnly: true });

  const settings = sanitizeLeadSettings(p?.halo_leads);
  const [{ token, secret }, bt, links] = await Promise.all([
    ensureLeadLink(admin, user.id),
    loadBoldTrailToken(admin, user.id),
    leadLinks(admin, user.id, settings),
  ]);

  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data } = await admin.from("halo_leads").select(LEAD_COLS)
    .eq("user_id", user.id).gte("received_at", since).neq("status", "skipped")
    .order("received_at", { ascending: false }).limit(30);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const rows = ((data ?? []) as LeadRow[]).filter((l) => l.status !== "sent" || Date.parse(l.sent_at ?? l.received_at) > weekAgo);
  const leads = await Promise.all(rows.map(async (l0) => {
    const l = await refreshLead(admin, l0);
    const v = await leadVideo(admin, l);
    return {
      id: l.id, kind: l.kind, name: l.name, email: l.email, phone: l.phone, site: l.site, forms: l.forms,
      summary: l.summary, businessName: l.business_name, town: l.town, message: l.message, leadLink: l.lead_link,
      status: l.status, mode: l.mode, script: l.script, draft: l.email_draft, error: l.error,
      sentAt: l.sent_at, sentVia: l.sent_via, receivedAt: l.received_at, haloDraft: !!l.halo_draft_id,
      video: v ? { id: v.id, url: v.url } : null,
    };
  }));

  return NextResponse.json({
    settings,
    link: `${APP}/api/halo/leads/${token}`,
    secret,
    boldtrail: !!bt,
    links,
    leads,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("halo_leads").eq("id", user.id).single();
  const cur = sanitizeLeadSettings((prof as { halo_leads: unknown } | null)?.halo_leads);

  if (typeof body.haloLink === "string" && body.haloLink.trim()) {
    const parsed = parseHaloLink(body.haloLink);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (typeof body.bookingUrl === "string" && body.bookingUrl.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(body.bookingUrl.trim())) {
    return NextResponse.json({ error: "That booking link isn't a web address." }, { status: 400 });
  }
  const next = sanitizeLeadSettings({
    ...cur,
    ...(typeof body.enabled === "boolean" && { enabled: body.enabled }),
    ...(typeof body.buyer === "string" && { buyer: body.buyer }),
    ...(typeof body.business === "string" && { business: body.business }),
    ...(typeof body.haloLink === "string" && { haloLink: body.haloLink }),
    ...(typeof body.bookingUrl === "string" && { bookingUrl: body.bookingUrl }),
  });
  const { error } = await admin.from("profiles").update({ halo_leads: next }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  return NextResponse.json({ settings: next });
}
