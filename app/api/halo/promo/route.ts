import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { startPromo, type HaloSiteRow, type PromoAngle } from "@/lib/halo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/halo/promo { siteId, angle, replaceDraftId? } — a promo video for
 * the agent's Halo referral page. Written in about a minute; it shows in the
 * Halo list to approve like the others. "New script" sends the old draft's id
 * to set it aside.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { siteId, angle, replaceDraftId } = (await req.json().catch(() => ({}))) as { siteId?: string; angle?: string; replaceDraftId?: string };
  const a: PromoAngle = angle === "free" || angle === "pro" ? angle : "why";

  const { data } = await s.admin
    .from("halo_sites")
    .select("id, user_id, url, is_affiliate")
    .eq("id", siteId ?? "")
    .eq("user_id", s.user.id)
    .single();
  const site = data as HaloSiteRow | null;
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  if (!site.is_affiliate) return NextResponse.json({ error: "Promo videos are for your Halo referral page." }, { status: 400 });

  // A few a week at most: each is a writer call.
  const { count } = await s.admin
    .from("autopilot_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", s.user.id)
    .eq("source", "halo_promo")
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "That's 5 promo scripts this week. Try again in a few days." }, { status: 429 });

  if (replaceDraftId) {
    await s.admin.from("autopilot_drafts").update({ status: "skipped" })
      .eq("id", replaceDraftId).eq("user_id", s.user.id).eq("source", "halo_promo").in("status", ["draft", "failed"]);
  }

  try {
    const { id, written } = await startPromo(s.admin, s.profile, site, a);
    waitUntil(written);
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[halo/promo]", err);
    return NextResponse.json({ error: "Couldn't start the promo video. Try again." }, { status: 500 });
  }
}
