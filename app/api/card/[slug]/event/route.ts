import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CARD_EVENTS } from "@/lib/card/card";

export const dynamic = "force-dynamic";

/** POST { kind } — an anonymous open or tap on a card, for its counts. No personal data. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string };
  if (!kind || !(CARD_EVENTS as readonly string[]).includes(kind)) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from("business_cards").select("user_id").eq("slug", params.slug.toLowerCase()).maybeSingle();
  const userId = (data as { user_id: string } | null)?.user_id;
  if (!userId) return NextResponse.json({ ok: false }, { status: 404 });
  await admin.from("business_card_events").insert({ user_id: userId, kind });
  return NextResponse.json({ ok: true });
}
