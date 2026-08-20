import { createClient } from "@/lib/supabase/server";
import { listBrandKits } from "@/lib/api/heygen";
import { NextResponse } from "next/server";

/**
 * GET /api/profile/heygen-brand-kits
 *
 * Brand kits available in the connected HeyGen account. Picking one applies its
 * colors, fonts and logo to everything the Video Agent builds, instead of the
 * prompt asking for the logo to be placed "prominently" and hoping.
 *
 * Returns an empty list rather than an error when the account has none or the
 * lookup fails — this is a settings nicety, not something worth failing on.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ brandKits: [] });
  }

  const brandKits = await listBrandKits();
  return NextResponse.json({ brandKits });
}
