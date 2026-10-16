import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findContactByEmail, loadBoldTrailToken, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { sellerUpdateAsHtml, sellerUpdateAsText } from "@/lib/utils/newsletter-html";

export const maxDuration = 60;

/**
 * The one-off BoldTrail test (2026-10-15), admins only.
 *
 * POST { email } or { contactId } — finds that contact in the agent's own
 * BoldTrail (exact email match only) and sends it two emails: a sample seller
 * update in SparkReels' email layout, and the same as plain text. What comes
 * back from BoldTrail is returned as it is, so we learn whether the layout
 * survives, whose address it comes from, and whether it is logged on the
 * contact. Sends to nobody else and creates or changes no contacts.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((me as { role?: string } | null)?.role !== "admin") return NextResponse.json({ error: "Not available" }, { status: 403 });

  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail first." }, { status: 400 });

  const { email, contactId } = (await req.json().catch(() => ({}))) as { email?: string; contactId?: string };
  let id: string | number | null = (contactId ?? "").trim() || null;
  let found: { tried: string[]; name?: string } = { tried: [] };
  if (!id) {
    if (!email?.includes("@")) return NextResponse.json({ error: "Enter the contact's email, or their BoldTrail contact ID." }, { status: 400 });
    const r = await findContactByEmail(token, email);
    found = { tried: r.tried, name: [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(" ") };
    if (!r.contact) {
      return NextResponse.json({
        error: "No BoldTrail contact has exactly that email. Try their contact ID from the contact's page instead.",
        tried: r.tried,
      }, { status: 404 });
    }
    id = r.contact.id;
  }

  const signature = await loadAgentSignature(admin, user.id);
  const sample = {
    subjects: ["SparkReels test: 12 Oak Lane update"],
    greeting: "Hi there,",
    opening: "This is a test from SparkReels, sent through BoldTrail. Here's how a seller update looks.",
    paragraphs: [
      "Buyers keep mentioning the kitchen and the yard. A couple felt the third bedroom was on the small side.",
      "Next steps: a second open house on Sunday, and we'll talk about price if there are no offers in two weeks.",
    ],
    closing: "Nothing to do with this one. It's only a test.",
  };
  const stats = { views: 412, saves: 23, showings: 5, openHouse: 14, offers: 0 };
  const before = { views: 298, saves: 17, showings: 3, openHouse: null, offers: 0 };
  const html = sellerUpdateAsHtml(sample, { subject: sample.subjects[0], stats, before, signature });
  const text = sellerUpdateAsText(sample, { stats, before, signature });

  const first = await sendBoldTrailEmail(token, id, "[SparkReels test 1 of 2] Email layout", html);
  const second = await sendBoldTrailEmail(token, id, "[SparkReels test 2 of 2] Plain text", text);

  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "boldtrail", endpoint: "boldtrail_test_email", credits_used: 0,
    response_status: Math.max(first.status, second.status),
  });

  return NextResponse.json({
    contactId: id,
    contactName: found.name || null,
    results: [
      { which: "Email layout", status: first.status, ok: first.ok, reply: first.text },
      { which: "Plain text", status: second.status, ok: second.ok, reply: second.text },
    ],
  });
}
