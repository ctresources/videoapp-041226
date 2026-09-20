import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImportToken, importAddressFor, INBOUND_DOMAIN } from "@/lib/utils/import-address";
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
async function addressFor(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("import_token")
    .eq("id", userId)
    .maybeSingle();

  const existing = (data as { import_token?: string | null } | null)?.import_token;
  if (existing) return importAddressFor(existing);

  // Retried on collision, which at 60 bits will not happen — but a UNIQUE
  // violation here would otherwise leave the user with no address at all.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateImportToken();
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

  const address = await addressFor(user.id);

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
 * Reset the address.
 *
 * For when the old one has been given out too widely — a new token means mail
 * to the old address no longer matches an account and is ignored. Existing
 * imports are kept: they are already-delivered text, and deleting someone's
 * saved articles is not what "give me a new address" asks for.
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
  if (action !== "reset") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const admin = createAdminClient();
  const token = generateImportToken();
  const { error } = await admin
    .from("profiles")
    .update({ import_token: token })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ address: importAddressFor(token) });
}
