import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findContactByEmail, loadBoldTrailToken } from "@/lib/api/boldtrail";

/**
 * POST { email } — the agent's BoldTrail contact with exactly that email, as
 * { id, name, email }, for Email it (2026-10-15). Never a near match, so a
 * video can't go to the wrong person.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const e = (email ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return NextResponse.json({ error: "Enter their email." }, { status: 400 });

  const admin = createAdminClient();
  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  const { contact } = await findContactByEmail(token, e);
  if (!contact) {
    return NextResponse.json({ error: "No contact in your BoldTrail has exactly that email. Add them in BoldTrail first, or check the spelling." }, { status: 404 });
  }
  return NextResponse.json({
    contact: {
      id: String(contact.id),
      name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || e,
      email: (contact.email ?? e).trim(),
    },
  });
}
