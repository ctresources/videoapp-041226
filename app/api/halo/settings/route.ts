import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { planHaloDrafts, sanitizeSettings } from "@/lib/halo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET  /api/halo/settings — the agent's Halo settings and sites.
 * POST /api/halo/settings — save the settings (any subset); every field is
 *      checked (sanitizeSettings). Open days are filled straight away when the
 *      change opened some, such as more videos a month.
 */
export async function GET() {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const { data: sites } = await s.admin
    .from("halo_sites")
    .select("id, url, is_affiliate, last_checked_at, last_error, created_at")
    .eq("user_id", s.user.id)
    .order("created_at");
  return NextResponse.json({ settings: sanitizeSettings(s.profile.halo_settings), sites: sites ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const patch = await req.json().catch(() => ({}));
  const current = sanitizeSettings(s.profile.halo_settings);
  const next = sanitizeSettings({ ...current, ...(patch && typeof patch === "object" ? patch : {}) });
  const { error } = await s.admin.from("profiles").update({ halo_settings: next }).eq("id", s.user.id);
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });

  const { written } = await planHaloDrafts(s.admin, { ...s.profile, halo_settings: next });
  waitUntil(written);
  return NextResponse.json({ settings: next });
}
