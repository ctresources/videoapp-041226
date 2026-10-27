import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { personCutout } from "@/lib/utils/thumbnail-render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/tools/thumbnail/cutout { url } — the picked photo with its
 * background removed, for the thumbnail editor's preview (2026-10-27). The
 * same stored cut-out the thumbnail itself uses, so a photo is cut out once.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !/^https:\/\/\S+$/.test(url)) return NextResponse.json({ error: "A photo link is needed." }, { status: 400 });
  try {
    const out = await personCutout(createAdminClient(), url);
    if (!out?.cut || !out.url) return NextResponse.json({ url: null });
    return NextResponse.json({ url: out.url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
