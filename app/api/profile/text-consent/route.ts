import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminPerks } from "@/lib/utils/roles";
import { isValidMobile } from "@/lib/utils/format-phone";

export const dynamic = "force-dynamic";

/**
 * The one-time text consent prompt (2026-11-22, the owner's approved mockup).
 * Users who signed up before the consent box existed are asked once, at their
 * next visit: a mobile number and the box, unticked. Save or Not now both mark
 * it asked (sms_prompted_at), so it never comes back; Settings still has the box.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ show: false });
  const { data } = await createAdminClient()
    .from("profiles")
    .select("role, mobile_phone, sms_consent_at, sms_prompted_at")
    .eq("id", user.id)
    .maybeSingle();
  const p = data as { role: string | null; mobile_phone: string | null; sms_consent_at: string | null; sms_prompted_at: string | null } | null;
  const show = !!p && !hasAdminPerks(p.role) && !p.sms_consent_at && !p.sms_prompted_at;
  return NextResponse.json({ show, mobile: p?.mobile_phone ?? "" });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; mobile?: unknown; consent?: unknown };
  const now = new Date().toISOString();
  const admin = createAdminClient();

  if (b.action === "later") {
    await admin.from("profiles").update({ sms_prompted_at: now }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  const mobile = typeof b.mobile === "string" ? b.mobile.trim().slice(0, 40) : "";
  if (!isValidMobile(mobile)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }
  // Dated from the server's clock: the record that the box was ticked here, now.
  const consented = b.consent === true;
  const { error } = await admin
    .from("profiles")
    .update({
      mobile_phone: mobile,
      sms_prompted_at: now,
      ...(consented && { sms_consent_at: now, sms_consent_source: "prompt" }),
    })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
