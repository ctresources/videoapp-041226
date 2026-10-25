import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHaloLinkFor } from "@/lib/halo/get-halo";

export const dynamic = "force-dynamic";

/**
 * GET /api/halo/get-link — where this agent's "Get Halo" button goes: the
 * Halo link of the affiliate who referred them, or the owner's (2026-10-24).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { affiliateId, ...link } = await getHaloLinkFor(createAdminClient(), user.id);
  return NextResponse.json(link);
}

/**
 * POST /api/halo/get-link — the agent pressed Get Halo: recorded with whose
 * link it went to, for Admin → Halo (2026-10-24, the owner's ask). Sent by
 * the button as the page leaves, so it never holds the agent up.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const l = await getHaloLinkFor(admin, user.id);
  const { error } = await admin.from("halo_get_clicks").insert({
    user_id: user.id,
    affiliate_id: l.affiliateId,
    link: l.url ?? `${l.code} PRO`,
  });
  if (error) console.error("[halo/get-link] click not recorded:", error.message);
  return NextResponse.json({ ok: !error });
}
