import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvatarConsentUrl } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/avatar/consent
 * Initiates the HeyGen consent flow for the user's avatar group.
 * Returns { url } — open this in a new tab for the user to approve.
 * Body: { reroute_url?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("heygen_photo_id, heygen_digital_twin_group_id, heygen_twin2_group_id")
    .eq("id", user.id)
    .single();

  try {
    const body = await req.json().catch(() => ({}));
    // Allow caller to override the group (e.g., Digital Twin group vs photo avatar group)
    // { twin: true } asks for the Digital Twin's own group (2026-10-23);
    // { twin: true, slot: 2 } the second twin's (2026-10-29).
    const p = profile as { heygen_photo_id: string | null; heygen_digital_twin_group_id: string | null; heygen_twin2_group_id: string | null } | null;
    const twinGroup = String(body.slot) === "2" ? p?.heygen_twin2_group_id : p?.heygen_digital_twin_group_id;
    const groupId = (body.group_id as string | undefined)
      || (body.twin === true ? twinGroup : null)
      || p?.heygen_photo_id;
    if (!groupId) return NextResponse.json({ error: "No avatar group found" }, { status: 400 });
    // Only this account's own avatars (2026-10-29): every customer's are on one HeyGen account.
    const own = [p?.heygen_photo_id, p?.heygen_digital_twin_group_id, p?.heygen_twin2_group_id].filter(Boolean);
    if (!own.includes(groupId)) return NextResponse.json({ error: "That avatar isn't on your account." }, { status: 403 });
    const url = await getAvatarConsentUrl(groupId, body.reroute_url);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[avatar-consent] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get consent URL" },
      { status: 422 },
    );
  }
}
