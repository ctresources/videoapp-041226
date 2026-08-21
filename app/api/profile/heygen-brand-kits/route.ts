import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBrandKit, getBrandKit } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

/**
 * The user's own HeyGen brand kit — scoped per account, not a list of every
 * kit in the app's shared HeyGen account. Each user gets at most one kit,
 * its id stored on their profile row (heygen_brand_kit_id), built from their
 * own website rather than picked from a dropdown that used to show every
 * other agent's kit too.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("heygen_brand_kit_id")
    .eq("id", user.id)
    .single();

  const brandKitId = (profile as { heygen_brand_kit_id?: string | null } | null)?.heygen_brand_kit_id;
  if (!brandKitId) return NextResponse.json({ brandKit: null });

  const brandKit = await getBrandKit(brandKitId);
  return NextResponse.json({ brandKit });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json() as { url?: string };
  if (!url?.trim()) {
    return NextResponse.json({ error: "A website URL is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim().match(/^https?:\/\//) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  let created: { id: string; status: string };
  try {
    created = await createBrandKit(parsed.toString());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "HeyGen couldn't build a brand kit from that URL";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ heygen_brand_kit_id: created.id })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Brand kit was created but couldn't be saved — try again" }, { status: 500 });
  }

  return NextResponse.json({ brandKit: { id: created.id, status: created.status } });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ heygen_brand_kit_id: null })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't turn off the brand kit" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
