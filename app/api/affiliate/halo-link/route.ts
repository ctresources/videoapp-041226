import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAffiliateForUser } from "@/lib/affiliate";
import { haloLinkText, parseHaloLink } from "@/lib/halo/get-halo";

export const dynamic = "force-dynamic";

/**
 * POST { link } — an approved affiliate's own Halo link: their Halo page
 * (…huzi.site) or code. Agents they referred to SparkReels get it on their
 * Get Halo button (2026-10-24, the owner's ask). An empty link clears it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const affiliate = await resolveAffiliateForUser(admin, user.id, user.email);
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Only approved affiliates can add a Halo link." }, { status: 403 });
  }

  const { link } = (await req.json().catch(() => ({}))) as { link?: string };
  let save: string | null = null;
  if (link && link.trim()) {
    const parsed = parseHaloLink(link);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    save = haloLinkText(parsed);
  }
  const { error } = await admin.from("affiliates").update({ halo_link: save, updated_at: new Date().toISOString() }).eq("id", affiliate.id);
  if (error) return NextResponse.json({ error: "Couldn't save it. Try again." }, { status: 500 });
  return NextResponse.json({ haloLink: save });
}
