import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact, loadBoldTrailToken } from "@/lib/api/boldtrail";

export const dynamic = "force-dynamic";

/**
 * POST { name, email } — someone who isn't in the agent's BoldTrail yet,
 * added there (or found, if they already are) and returned as
 * { id, name, email } so the send box can pick them like anyone else
 * (2026-10-24, the owner's ask). Nothing is sent from here.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
  const email = (body.email ?? "").trim().slice(0, 200);
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter their email." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter their name." }, { status: 400 });

  const token = await loadBoldTrailToken(createAdminClient(), user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  const [firstName, ...rest] = name.split(" ");
  try {
    const r = await findOrCreateContact(token, { email, firstName, lastName: rest.join(" ") });
    if (!r.contact) return NextResponse.json({ error: r.error ?? "Couldn't add them." }, { status: 502 });
    return NextResponse.json({ contact: r.contact, created: r.created });
  } catch (err) {
    console.error("[boldtrail/contact]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't reach BoldTrail just now." }, { status: 502 });
  }
}
