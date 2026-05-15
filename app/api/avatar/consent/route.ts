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
    .select("heygen_photo_id")
    .eq("id", user.id)
    .single();

  if (!profile?.heygen_photo_id) {
    return NextResponse.json({ error: "No avatar group found" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = await getAvatarConsentUrl(profile.heygen_photo_id, body.reroute_url);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[avatar-consent] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get consent URL" },
      { status: 422 },
    );
  }
}
