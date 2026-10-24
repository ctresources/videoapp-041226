import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoldTrailToken, searchContacts } from "@/lib/api/boldtrail";

export const dynamic = "force-dynamic";

/**
 * GET /api/boldtrail/search?q=… — the agent's BoldTrail contacts whose first
 * name, last name or email starts with q, as { id, name, email }, for the
 * search box in the send box (2026-10-24, the owner's ask). The agent picks
 * from these; nothing is sent from here.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ contacts: [] });

  const token = await loadBoldTrailToken(createAdminClient(), user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  try {
    return NextResponse.json({ contacts: await searchContacts(token, q) });
  } catch (err) {
    console.error("[boldtrail/search]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't search BoldTrail just now." }, { status: 502 });
  }
}
