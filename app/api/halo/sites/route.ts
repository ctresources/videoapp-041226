import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { checkSite, planHaloDrafts, type HaloSiteRow } from "@/lib/halo";
import { fetchText, isAffiliateHost, normalizeSiteUrl } from "@/lib/halo/site-reader";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SITES = 6;

/**
 * POST   /api/halo/sites { url } — add a website. Its pages are read once
 *        now: what is already there is recorded as seen, and the current
 *        market report and events page are offered. Drafts for the open days
 *        are written in the background.
 * DELETE /api/halo/sites { id } — remove one, with its pages. Drafts already
 *        written stay.
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const site = normalizeSiteUrl(url ?? "");
  if (!site) return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });

  const { count } = await s.admin.from("halo_sites").select("id", { count: "exact", head: true }).eq("user_id", s.user.id);
  if ((count ?? 0) >= MAX_SITES) return NextResponse.json({ error: `Up to ${MAX_SITES} sites.` }, { status: 400 });

  const home = await fetchText(site);
  if (!home.ok) return NextResponse.json({ error: "We couldn't open that site. Check the address." }, { status: 400 });

  const { data, error } = await s.admin
    .from("halo_sites")
    .insert({ user_id: s.user.id, url: site, is_affiliate: isAffiliateHost(site) })
    .select("id, user_id, url, is_affiliate")
    .single();
  if (error || !data) {
    if (error && /duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "That site is already added." }, { status: 400 });
    return NextResponse.json({ error: "Couldn't add that site. Try again." }, { status: 500 });
  }
  const row = data as HaloSiteRow;
  const result = await checkSite(s.admin, row);
  const { written } = await planHaloDrafts(s.admin, s.profile);
  waitUntil(written);
  return NextResponse.json({ site: row, ...result });
}

export async function DELETE(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await s.admin.from("halo_sites").delete().eq("id", id).eq("user_id", s.user.id);
  if (error) return NextResponse.json({ error: "Couldn't remove it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
