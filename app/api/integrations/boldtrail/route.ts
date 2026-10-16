import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/crypto/tokens";
import { checkBoldTrailToken } from "@/lib/api/boldtrail";

/**
 * The agent's BoldTrail API token (2026-10-15).
 *
 *   GET     { connected, last4, connectedAt, canTest }   never the token itself
 *   POST    { token }                            checks it with BoldTrail, saves it encrypted
 *   DELETE                                       forgets it
 *
 * Refuses to save when encryption isn't configured, rather than keeping a
 * year-long credential as plain text.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_tokens")
    .select("last4, created_at")
    .eq("user_id", user.id)
    .eq("provider", "boldtrail")
    .maybeSingle();
  // The one-off test is for admins only, while the BoldTrail send is proved.
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return NextResponse.json({
    connected: !!data, last4: data?.last4 ?? null, connectedAt: data?.created_at ?? null,
    canTest: (me as { role?: string } | null)?.role === "admin",
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  const t = (token ?? "").trim();
  if (t.length < 20 || t.length > 4000 || /\s/.test(t)) {
    return NextResponse.json({ error: "That doesn't look like a BoldTrail API token. Copy it again from My API Tokens." }, { status: 400 });
  }

  const check = await checkBoldTrailToken(t);
  if (check === "rejected") {
    return NextResponse.json({ error: "BoldTrail didn't accept that token. Check it hasn't expired, or make a new one." }, { status: 400 });
  }

  const enc = encryptToken(t);
  if (!enc) {
    console.error("[boldtrail] TOKEN_ENCRYPTION_KEY not set; refusing to store a token in plain text");
    return NextResponse.json({ error: "Connecting BoldTrail isn't available right now." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("integration_tokens").upsert({
    user_id: user.id, provider: "boldtrail", token_enc: enc, last4: t.slice(-4), created_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return NextResponse.json({ error: "Couldn't save the token." }, { status: 500 });
  return NextResponse.json({ connected: true, last4: t.slice(-4), checked: check === "ok" });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  await admin.from("integration_tokens").delete().eq("user_id", user.id).eq("provider", "boldtrail");
  return NextResponse.json({ connected: false });
}
