import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autopilotEligible } from "@/lib/autopilot";
import { loadBoldTrailToken } from "@/lib/api/boldtrail";
import { draftVideo, ensureSellerDrafts, sanitizeSellerAuto, type DraftRow } from "@/lib/seller/auto";

export const dynamic = "force-dynamic";

/**
 * Seller Updates on AutoSparks (2026-10-26).
 *
 * GET  the settings, the listings (with whether their sellers are added), and
 *      this and last week's cards with each one's numbers, email and video.
 *      Makes the coming week's cards first.
 * POST { enabled?, weekday?, time?, video?, text? } saves the settings.
 */
async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, role, subscription_tier, time_zone, seller_auto").eq("id", user.id).single();
  const profile = data as { id: string; role: string | null; subscription_tier: string | null; time_zone: string | null; seller_auto: unknown } | null;
  if (!profile) return null;
  return { user, admin, profile };
}

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!autopilotEligible(s.profile)) return NextResponse.json({ paidOnly: true });
  const { admin, profile } = s;
  const settings = sanitizeSellerAuto(profile.seller_auto);
  await ensureSellerDrafts(admin, profile);

  const [{ data: listings }, { data: drafts }, token] = await Promise.all([
    admin.from("seller_listings").select("id, address, seller_names, boldtrail_contacts").eq("user_id", profile.id).is("archived_at", null).order("created_at", { ascending: false }),
    admin.from("seller_auto_drafts")
      .select("id, user_id, listing_id, update_on, slot_at, status, mode, also_text, project_id, video_id, error, sent_at")
      .eq("user_id", profile.id)
      .neq("status", "skipped")
      .gte("slot_at", new Date(Date.now() - 8 * 86_400_000).toISOString())
      .order("slot_at"),
    loadBoldTrailToken(admin, profile.id),
  ]);

  const rows = (drafts ?? []) as (DraftRow & { error: string | null; sent_at: string | null })[];
  const cards = await Promise.all(rows.map(async (d) => {
    const { data: ups } = await admin
      .from("seller_listing_updates")
      .select("update_on, views, saves, showings, open_house_visitors, offers, feedback, next_steps, email, video_url, video_poster_url, sent_at, sent_to")
      .eq("listing_id", d.listing_id).lte("update_on", d.update_on)
      .order("update_on", { ascending: false }).limit(2);
    const list = (ups ?? []) as { update_on: string; email: unknown; video_url: string | null; sent_at: string | null }[];
    const current = list.find((u) => u.update_on === d.update_on) ?? null;
    const before = list.find((u) => u.update_on < d.update_on) ?? null;
    let video = await draftVideo(admin, d);
    // A take recorded in Spark Tools for this day counts too.
    if (!video && current?.video_url) video = { id: "", url: current.video_url, seconds: null };
    // Made and finished: ready to watch and approve.
    if (d.status === "making" && video && typeof video === "object") {
      await admin.from("seller_auto_drafts").update({ status: "ready" }).eq("id", d.id);
      d.status = "ready";
    }
    // The video failed: back to the numbers, to make it again or send email only.
    if (d.status === "making" && video === "failed") {
      const error = "The video didn't finish, and your video was given back. Make it again, or choose Email only.";
      await admin.from("seller_auto_drafts").update({ status: "failed", error }).eq("id", d.id);
      d.status = "failed"; d.error = error;
    }
    // Sent by hand from Spark Tools: done here too.
    if (current?.sent_at && d.status !== "sent") {
      await admin.from("seller_auto_drafts").update({ status: "sent", sent_at: current.sent_at }).eq("id", d.id);
      d.status = "sent"; d.sent_at = current.sent_at;
    }
    return { ...d, current, before, video };
  }));

  return NextResponse.json({
    settings,
    boldtrail: !!token,
    listings: ((listings ?? []) as { id: string; address: string; seller_names: string | null; boldtrail_contacts: { name: string }[] | null }[])
      .map((l) => ({ id: l.id, address: l.address, sellers: (l.boldtrail_contacts ?? []).map((c) => c.name) })),
    cards,
  });
}

export async function POST(req: NextRequest) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!autopilotEligible(s.profile)) return NextResponse.json({ error: "Seller updates on AutoSparks are part of the paid plans." }, { status: 403 });
  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = sanitizeSellerAuto({ ...sanitizeSellerAuto(s.profile.seller_auto), ...patch });
  await s.admin.from("profiles").update({ seller_auto: settings }).eq("id", s.profile.id);
  // A new day or time moves the coming cards that haven't been started.
  if ("weekday" in patch || "time" in patch) {
    await s.admin.from("seller_auto_drafts").delete().eq("user_id", s.profile.id).eq("status", "open").gt("slot_at", new Date().toISOString());
  }
  await ensureSellerDrafts(s.admin, { ...s.profile, seller_auto: settings });
  return NextResponse.json({ settings });
}
