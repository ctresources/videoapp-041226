import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/tokens";

/**
 * BoldTrail (kvCORE) Public API v2, with the agent's own API token
 * (2026-10-15). https://apidocs.kvcore.com — the parts used here:
 *
 *   PUT /v2/public/contact/{id}/email   { subject, message }  sends one email
 *   PUT /v2/public/contact/{id}/action/note                    adds a note
 *   GET  contacts, to find a contact by email
 *
 * The docs page did not show the contacts list's query parameters, so
 * findContactByEmail tries the likely ones and only ever accepts a contact
 * whose email matches exactly — it must never email the wrong person.
 */

const BASE = "https://api.kvcore.com/v2/public";

export async function loadBoldTrailToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_tokens")
    .select("token_enc")
    .eq("user_id", userId)
    .eq("provider", "boldtrail")
    .maybeSingle();
  return data?.token_enc ? decryptToken(data.token_enc as string) : null;
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 500) };
}

/**
 * Whether BoldTrail accepts the token: 401/403 is a clear no. Anything else
 * (including an endpoint shape we guessed wrong) is not held against it.
 */
export async function checkBoldTrailToken(token: string): Promise<"ok" | "rejected" | "unknown"> {
  try {
    const r = await call(token, "GET", "/contacts?limit=1");
    if (r.status === 401 || r.status === 403) return "rejected";
    return r.ok ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

type Contact = { id: number | string; email?: string; first_name?: string; last_name?: string; name?: string };

function contactsIn(json: unknown): Contact[] {
  if (Array.isArray(json)) return json as Contact[];
  const j = json as { data?: unknown; contacts?: unknown } | null;
  if (Array.isArray(j?.data)) return j!.data as Contact[];
  if (Array.isArray(j?.contacts)) return j!.contacts as Contact[];
  return [];
}

/** The contact whose email is exactly this one, or null. */
export async function findContactByEmail(token: string, email: string): Promise<{ contact: Contact | null; tried: string[] }> {
  const want = email.trim().toLowerCase();
  const q = encodeURIComponent(email.trim());
  const tried: string[] = [];
  for (const path of [`/contacts?filter[email]=${q}`, `/contacts?search=${q}`, `/contacts?email=${q}`]) {
    tried.push(path);
    const r = await call(token, "GET", path);
    if (r.status === 401 || r.status === 403) break;
    const hit = contactsIn(r.json).find((c) => (c.email ?? "").trim().toLowerCase() === want);
    if (hit) return { contact: hit, tried };
  }
  return { contact: null, tried };
}

/**
 * Contacts whose first name, last name or email starts with what the agent
 * typed (2026-10-24, the search box in the send box). BoldTrail's contacts
 * list takes filter[first_name], filter[last_name] and filter[email], each an
 * exact match or a prefix (read off apidocs.kvcore.com). "Dan Ok" searches
 * first name Dan and last name Ok together. Only contacts with an email, up
 * to 8.
 */
export async function searchContacts(token: string, q: string): Promise<{ id: string; name: string; email: string }[]> {
  const term = q.trim().replace(/\s+/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const enc = encodeURIComponent;
  const parts = term.split(" ");
  const paths = term.includes("@")
    ? [`/contacts?filter[email]=${enc(term)}&limit=10`]
    : parts.length >= 2
      ? [
          `/contacts?filter[first_name]=${enc(parts[0])}&filter[last_name]=${enc(parts.slice(1).join(" "))}&limit=10`,
          `/contacts?filter[last_name]=${enc(term)}&limit=10`,
        ]
      : [
          `/contacts?filter[first_name]=${enc(term)}&limit=10`,
          `/contacts?filter[last_name]=${enc(term)}&limit=10`,
          `/contacts?filter[email]=${enc(term)}&limit=10`,
        ];
  const results = await Promise.all(paths.map((p) => call(token, "GET", p).catch(() => null)));
  const seen = new Set<string>();
  const out: { id: string; name: string; email: string }[] = [];
  for (const r of results) {
    if (!r?.ok) continue;
    for (const c of contactsIn(r.json)) {
      const id = String(c.id);
      const email = (c.email ?? "").trim();
      if (!email || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, email, name: (c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || email).trim() });
      if (out.length >= 8) return out;
    }
  }
  return out;
}

/**
 * The contact with exactly this email, adding it to the agent's BoldTrail
 * first if there isn't one (2026-10-24, the owner's ask: someone not in
 * BoldTrail yet can still be picked). POST /v2/public/contact; the docs show
 * no reply body, so the new contact is then found by its email.
 *
 * Without assigned_agent_id BoldTrail runs the contact through the account's
 * lead routing, which on a team could hand the agent's own contact to someone
 * else, so it is assigned to whoever most of the agent's contacts are
 * assigned to (the agent, for an agent's own token). Automated texts are
 * left off; nobody gave a texting consent here.
 */
export async function findOrCreateContact(
  token: string,
  p: { email: string; firstName: string; lastName: string },
): Promise<{ contact: { id: string; name: string; email: string } | null; created: boolean; error?: string }> {
  const email = p.email.trim();
  const shape = (c: Contact) => ({
    id: String(c.id),
    email: (c.email ?? email).trim(),
    name: (c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || [p.firstName, p.lastName].filter(Boolean).join(" ") || email).trim(),
  });

  const existing = await findContactByEmail(token, email);
  if (existing.contact) return { contact: shape(existing.contact), created: false };

  let assigned: number | undefined;
  const sample = await call(token, "GET", "/contacts?limit=50").catch(() => null);
  if (sample?.ok) {
    const counts = new Map<number, number>();
    for (const c of contactsIn(sample.json) as (Contact & { assigned_agent_id?: number | null })[]) {
      if (c.assigned_agent_id) counts.set(c.assigned_agent_id, (counts.get(c.assigned_agent_id) ?? 0) + 1);
    }
    let best = 0;
    counts.forEach((n, id) => { if (n > best) { best = n; assigned = id; } });
  }

  const r = await call(token, "POST", "/contact", {
    first_name: p.firstName.trim() || null,
    last_name: p.lastName.trim() || null,
    email,
    status: 3, // Sphere: someone the agent knows and chose to email
    source: "SparkReels",
    capture_method: "Added in SparkReels",
    text_on: 0,
    ...(assigned ? { assigned_agent_id: assigned } : {}),
  });
  if (r.status === 401 || r.status === 403) {
    return { contact: null, created: false, error: "Your BoldTrail key can't add contacts. Add them in BoldTrail, or make a key that can manage contacts." };
  }
  if (!r.ok) {
    console.error("[boldtrail] create contact", r.status, r.text);
    return { contact: null, created: false, error: "BoldTrail didn't add them. Check the email, or add them in BoldTrail." };
  }

  const fromReply = contactsIn(r.json)[0] ?? (r.json as Contact | null);
  if (fromReply && (fromReply as Contact).id) return { contact: shape(fromReply as Contact), created: true };
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((res) => setTimeout(res, 1200));
    const again = await findContactByEmail(token, email);
    if (again.contact) return { contact: shape(again.contact), created: true };
  }
  return { contact: null, created: true, error: "Added to BoldTrail, but it isn't showing yet. Search for them again in a minute." };
}

export async function sendBoldTrailEmail(token: string, contactId: string | number, subject: string, message: string) {
  return call(token, "PUT", `/contact/${encodeURIComponent(String(contactId))}/email`, { subject, message });
}

export async function sendBoldTrailText(token: string, contactId: string | number, message: string) {
  return call(token, "PUT", `/contact/${encodeURIComponent(String(contactId))}/text`, { message });
}
