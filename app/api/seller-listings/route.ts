import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The agent's saved listings, for the Seller Update (2026-10-15).
 *
 *   GET                                      the listings, newest first, with when each was last updated
 *   GET    ?suggest=1                        properties from the Listings & photos tab not saved here yet
 *   POST   { address, sellerNames, listPrice, listedOn }   adds one
 *   PATCH  { id, address?, sellerNames?, listPrice?, listedOn? }   edits one
 *   DELETE ?id=                              takes one off the list (kept, archived)
 *
 * The tables have no policies; every call here checks the owner.
 */

const MAX_LISTINGS = 100;

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** For telling one address from another written slightly differently. */
const sameAddress = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The properties the agent has already entered in the Listings & photos tab
 * (listing videos keep address and price on listing_data; photo reels keep the
 * address since 2026-10-15), newest first, one per address, leaving out the
 * ones already saved here. Offered under "From your listings" in Add a
 * listing; nothing is added until the agent picks one.
 */
async function suggestions(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: projects }, { data: saved }] = await Promise.all([
    admin
      .from("projects")
      .select("listing_data, project_type, created_at")
      .eq("user_id", userId)
      .not("listing_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(60),
    admin.from("seller_listings").select("address").eq("user_id", userId).is("archived_at", null),
  ]);
  const taken = new Set((saved ?? []).map((s) => sameAddress(s.address as string)));
  const out: { address: string; price: string | null; kind: string; created_at: string }[] = [];
  for (const p of projects ?? []) {
    const ld = (p.listing_data ?? {}) as { address?: unknown; price?: unknown };
    const address = typeof ld.address === "string" ? ld.address.trim() : "";
    if (!address) continue;
    const key = sameAddress(address);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({
      address,
      price: typeof ld.price === "string" && ld.price.trim() ? ld.price.trim() : null,
      kind: p.project_type === "listing_video" ? "listing video" : "photo reel",
      created_at: p.created_at as string,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (new URL(req.url).searchParams.get("suggest") === "1") {
    return NextResponse.json({ suggestions: await suggestions(admin, user.id) });
  }
  const { data: listings, error } = await admin
    .from("seller_listings")
    .select("id, address, seller_names, list_price, listed_on, created_at, boldtrail_contacts")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LISTINGS);
  if (error) return NextResponse.json({ error: "Couldn't load your listings." }, { status: 500 });

  const ids = (listings ?? []).map((l) => l.id);
  const last: Record<string, string> = {};
  if (ids.length) {
    const { data: ups } = await admin
      .from("seller_listing_updates")
      .select("listing_id, updated_at")
      .in("listing_id", ids)
      .order("updated_at", { ascending: false });
    for (const u of ups ?? []) if (!last[u.listing_id]) last[u.listing_id] = u.updated_at;
  }
  return NextResponse.json({
    listings: (listings ?? []).map((l) => ({ ...l, last_update_at: last[l.id] ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const address = clean(body.address);
  if (!address) return NextResponse.json({ error: "Enter the listing's address." }, { status: 400 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("seller_listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("archived_at", null);
  if ((count ?? 0) >= MAX_LISTINGS) {
    return NextResponse.json({ error: `That's ${MAX_LISTINGS} listings. Remove one you've sold first.` }, { status: 400 });
  }

  const { data, error } = await admin
    .from("seller_listings")
    .insert({
      user_id: user.id,
      address,
      seller_names: clean(body.sellerNames) || null,
      list_price: clean(body.listPrice, 40) || null,
      listed_on: isDate(body.listedOn) ? body.listedOn : null,
    })
    .select("id, address, seller_names, list_price, listed_on, created_at, boldtrail_contacts")
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save the listing." }, { status: 500 });
  return NextResponse.json({ listing: { ...data, last_update_at: null } });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("address" in body) {
    const a = clean(body.address);
    if (!a) return NextResponse.json({ error: "Enter the listing's address." }, { status: 400 });
    patch.address = a;
  }
  if ("sellerNames" in body) patch.seller_names = clean(body.sellerNames) || null;
  if ("listPrice" in body) patch.list_price = clean(body.listPrice, 40) || null;
  if ("listedOn" in body) patch.listed_on = isDate(body.listedOn) ? body.listedOn : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("seller_listings")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, address, seller_names, list_price, listed_on, created_at, boldtrail_contacts")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't save the listing." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  return NextResponse.json({ listing: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_listings")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't remove the listing." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
