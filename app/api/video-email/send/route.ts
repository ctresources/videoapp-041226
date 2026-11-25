import { NextRequest, NextResponse } from "next/server";
import { staffLimits, STAFF_NO_EMAIL } from "@/lib/staff/staff";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVideoEmail, type VideoEmailInput } from "@/lib/email/video-email-send";

export const maxDuration = 60;

/**
 * Sends a My Sparks video to up to ten chosen people (2026-10-15). Only from
 * the agent's own press of "Send now" after a confirmation.
 *
 * POST { videoId, subject, note, contacts: [{ id, name, email }], copyMe?, reviewButton? }
 *
 * The sending itself is lib/email/video-email-send.ts since 2026-11-25, shared
 * with the AI follow-up step. Same path, same answers as before.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Staff without email access (Admin → Staff activity, 2026-10-30).
  if ((await staffLimits(user.id))?.emails === false) return NextResponse.json({ error: STAFF_NO_EMAIL, code: "staff_access" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as VideoEmailInput;
  const r = await sendVideoEmail(createAdminClient(), { id: user.id, email: user.email }, body);
  return NextResponse.json(r.body, { status: r.status });
}
