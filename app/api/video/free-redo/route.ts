/**
 * GET /api/video/free-redo?projectId=…  →  { free: boolean }
 *
 * Whether the next video on this project is the free redo, so the editor can
 * say so before Spark Video is pressed. The render routes decide for
 * themselves with the same check (lib/utils/free-redo.ts); this only reads.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminPerks } from "@/lib/utils/roles";
import { freeRedoFor } from "@/lib/utils/free-redo";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ free: false });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, subscription_tier").eq("id", user.id).single();
  const p = profile as { role: string | null; subscription_tier: string | null } | null;
  // Admins are never charged, so there is nothing to say.
  if (!p || hasAdminPerks(p.role)) return NextResponse.json({ free: false });

  return NextResponse.json({ free: await freeRedoFor(admin, user.id, projectId, p.subscription_tier) });
}
