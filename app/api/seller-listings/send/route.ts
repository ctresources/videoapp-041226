import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSellerUpdate } from "@/lib/seller/send";

export const maxDuration = 60;

/**
 * Sends a written seller update to the listing's sellers through the agent's
 * BoldTrail (2026-10-15). Only from the agent's own press of "Send now" after
 * a confirmation; nothing here runs on its own.
 *
 * POST { listingId, updateOn, subjectIdx, alsoText }
 *
 * Each seller gets their own email, built here from the saved update exactly
 * as the preview shows it (video included), from the agent's BoldTrail
 * address, and BoldTrail logs it on their contact (confirmed in the owner's
 * test). With alsoText, a one-line text follows from BoldTrail. When and to
 * whom it went is kept on the update.
 */

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, updateOn, subjectIdx, alsoText } = (await req.json().catch(() => ({}))) as {
    listingId?: string; updateOn?: string; subjectIdx?: number; alsoText?: boolean;
  };
  if (!listingId || !isDate(updateOn)) return NextResponse.json({ error: "listingId and updateOn are required" }, { status: 400 });

  const r = await sendSellerUpdate(createAdminClient(), user.id, listingId, updateOn, { subjectIdx, alsoText });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.results ? { results: r.results } : {}) }, { status: r.status });
  return NextResponse.json({ sentAt: r.sentAt, results: r.results });
}
