import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findContactByEmail, loadBoldTrailToken } from "@/lib/api/boldtrail";

/**
 * A listing's sellers, as contacts in the agent's BoldTrail (2026-10-15).
 *
 *   POST   { listingId, email }       finds the contact with exactly that email and adds them
 *   DELETE ?listingId=&contactId=     takes one off this listing (nothing changes in BoldTrail)
 *
 * Only an exact email match is ever added, so an update can't be sent to the
 * wrong person because a name or a search came close.
 */

const MAX_SELLERS = 4;
type BtContact = { id: string; name: string; email: string };

async function ownListing(admin: ReturnType<typeof createAdminClient>, userId: string, listingId: string) {
  const { data } = await admin
    .from("seller_listings")
    .select("id, boldtrail_contacts")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { id: data.id as string, contacts: ((data.boldtrail_contacts ?? []) as BtContact[]) } : null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, email } = (await req.json().catch(() => ({}))) as { listingId?: string; email?: string };
  const e = (email ?? "").trim();
  if (!listingId || !/^\S+@\S+\.\S+$/.test(e)) return NextResponse.json({ error: "Enter the seller's email." }, { status: 400 });

  const admin = createAdminClient();
  const listing = await ownListing(admin, user.id, listingId);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (listing.contacts.length >= MAX_SELLERS) return NextResponse.json({ error: `Up to ${MAX_SELLERS} sellers per listing.` }, { status: 400 });

  const token = await loadBoldTrailToken(admin, user.id);
  if (!token) return NextResponse.json({ error: "Connect BoldTrail in Settings first." }, { status: 400 });

  const { contact } = await findContactByEmail(token, e);
  if (!contact) {
    return NextResponse.json({ error: "No contact in your BoldTrail has exactly that email. Add them in BoldTrail first, or check the spelling." }, { status: 404 });
  }
  const added: BtContact = {
    id: String(contact.id),
    name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || e,
    email: (contact.email ?? e).trim(),
  };
  if (listing.contacts.some((c) => c.id === added.id)) return NextResponse.json({ contacts: listing.contacts });

  const contacts = [...listing.contacts, added];
  const { error } = await admin.from("seller_listings").update({ boldtrail_contacts: contacts, updated_at: new Date().toISOString() }).eq("id", listing.id);
  if (error) return NextResponse.json({ error: "Couldn't save that seller." }, { status: 500 });
  return NextResponse.json({ contacts });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const listingId = params.get("listingId") ?? "";
  const contactId = params.get("contactId") ?? "";
  const admin = createAdminClient();
  const listing = await ownListing(admin, user.id, listingId);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const contacts = listing.contacts.filter((c) => c.id !== contactId);
  await admin.from("seller_listings").update({ boldtrail_contacts: contacts, updated_at: new Date().toISOString() }).eq("id", listing.id);
  return NextResponse.json({ contacts });
}
