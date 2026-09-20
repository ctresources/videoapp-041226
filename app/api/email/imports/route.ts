import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImportToken, importAddressFor, INBOUND_DOMAIN } from "@/lib/utils/import-address";
import { sendImportAddress } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

/**
 * The agent's side of the email import: their private address, what has arrived
 * at it, and the text of one item.
 *
 * The list is deliberately short and unread-agnostic. This is not an inbox to
 * live in — it is the last few things forwarded, offered at the moment a script
 * or an article is being started.
 */

const LIST_LIMIT = 10;

interface ImportRow {
  id: string;
  subject: string | null;
  from_address: string | null;
  word_count: number;
  received_at: string;
  body_text: string;
  image_urls: string[];
}

/** Mints the address on first use rather than in a migration backfill. */
async function addressFor(userId: string, email: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("import_token, full_name")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as { import_token?: string | null; full_name?: string | null } | null;

  if (profile?.import_token) return importAddressFor(profile.import_token);

  // Retried on collision — two people called Dave drawing the same six
  // characters is unlikely rather than impossible, and a UNIQUE violation here
  // would otherwise leave someone with no address at all.
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = generateImportToken(profile?.full_name, email);
    const { error } = await admin
      .from("profiles")
      .update({ import_token: token })
      .eq("id", userId);
    if (!error) return importAddressFor(token);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");

  // One item, with its text — asked for when the agent picks it.
  if (id) {
    const { data, error } = await supabase
      .from("email_imports")
      .select("id, subject, from_address, word_count, received_at, body_text, image_urls")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = data as ImportRow;
    return NextResponse.json({
      id: row.id,
      subject: row.subject,
      text: row.body_text,
      words: row.word_count,
      imageUrls: row.image_urls ?? [],
    });
  }

  // The list. Reads with the user's own client, so row-level security is what
  // keeps one account's forwards out of another's.
  const { data, error } = await supabase
    .from("email_imports")
    .select("id, subject, from_address, word_count, received_at, body_text")
    .order("received_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const address = await addressFor(user.id, user.email ?? null);

  return NextResponse.json({
    address,
    domain: INBOUND_DOMAIN,
    items: ((data ?? []) as ImportRow[]).map((row) => ({
      id: row.id,
      subject: row.subject || "(no subject)",
      from: row.from_address,
      words: row.word_count,
      receivedAt: row.received_at,
      // Enough to recognise the piece without sending every article down for a
      // list the agent may only glance at.
      preview: (row.body_text ?? "").slice(0, 160),
    })),
  });
}

/** Remove one import. */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("email_imports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Two things that act on the address itself.
 *
 * "reset" — for when the old one has been given out too widely. A new token
 * means mail to the old address no longer matches an account and is ignored.
 * Existing imports are kept: they are already-delivered text, and deleting
 * someone's saved articles is not what "give me a new address" asks for.
 *
 * "send" — puts the address in their own inbox, which is where forwarding
 * happens.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let action = "";
  try {
    ({ action } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const fullName = (data as { full_name?: string | null } | null)?.full_name ?? null;

  if (action === "reset") {
    const token = generateImportToken(fullName, user.email ?? null);
    const { error } = await admin
      .from("profiles")
      .update({ import_token: token })
      .eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ address: importAddressFor(token) });
  }

  if (action === "send") {
    if (!user.email) {
      return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
    }
    const address = await addressFor(user.id, user.email);
    if (!address) return NextResponse.json({ error: "No import address yet" }, { status: 500 });

    const sent = await sendImportAddress({ email: user.email, name: fullName, address });
    if (!sent) {
      return NextResponse.json({ error: "Could not send that email — try again shortly" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, to: user.email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
