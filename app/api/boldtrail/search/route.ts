import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanFilter, findContacts, loadBoldTrailToken } from "@/lib/api/boldtrail";

export const dynamic = "force-dynamic";

/**
 * GET /api/boldtrail/search?q=…&status=2&type=seller — the agent's BoldTrail
 * contacts whose first name, last name or email starts with q (2026-10-24),
 * by Status and Type (2026-11-25), as { contacts: [{ id, name, email, status,
 * type }], total }. With a filter, q may be empty. The agent picks from these;
 * nothing is sent from here.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const filter = cleanFilter({ status: sp.get("status"), type: sp.get("type") });
  const filtered = filter.status !== null || !!filter.type;
  if (q.trim().length < 2 && !filtered) return NextResponse.json({ contacts: [], total: null });

  const token = await loadBoldTrailToken(createAdminClient(), user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  try {
    return NextResponse.json(await findContacts(token, q, filter));
  } catch (err) {
    console.error("[boldtrail/search]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't search BoldTrail just now." }, { status: 502 });
  }
}
