import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enhanceHeadshot } from "@/lib/utils/photo-touchup";

/**
 * POST /api/avatar/enhance-photo — { imageUrl } → { url } (2026-11-15).
 * Enhance photo for a photo avatar or a look: a plain light, color and
 * sharpness fix (no AI, the owner's choice), so the face never changes.
 * Costs nothing to run, so it has no allowance.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageUrl } = (await req.json().catch(() => ({}))) as { imageUrl?: string };
  let src: URL;
  try {
    src = new URL(imageUrl ?? "");
    if (src.protocol !== "https:" || !src.hostname.endsWith(".supabase.co")) throw new Error();
  } catch {
    return NextResponse.json({ error: "Upload the photo first." }, { status: 400 });
  }

  try {
    const res = await fetch(src.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error("fetch");
    const out = await enhanceHeadshot(Buffer.from(await res.arrayBuffer()));
    if (!out) return NextResponse.json({ error: "Couldn't enhance this photo. Try again." }, { status: 502 });
    const admin = createAdminClient();
    const path = `${user.id}/enhanced_${Date.now()}.jpg`;
    const { error } = await admin.storage.from("avatars").upload(path, out, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ url: admin.storage.from("avatars").getPublicUrl(path).data.publicUrl });
  } catch (err) {
    console.error("[avatar/enhance-photo]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't enhance this photo. Try again." }, { status: 500 });
  }
}
