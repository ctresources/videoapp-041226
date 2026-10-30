import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardActive, loadCardBySlug, vcardFor } from "@/lib/card/card";

export const dynamic = "force-dynamic";

/** GET — the agent's contact card, so Save my contact adds them to the phone. */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const admin = createAdminClient();
  const card = await loadCardBySlug(admin, params.slug);
  if (!card || !cardActive(card)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await admin.from("business_card_events").insert({ user_id: card.userId, kind: "save" });
  const file = (card.profile.full_name || "contact").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "contact";
  return new NextResponse(vcardFor(card), {
    headers: { "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.vcf"` },
  });
}
