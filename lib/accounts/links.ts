import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Linked accounts (2026-11-25, the owner's approved mockup:
 * docs/mockups/switch-accounts.html). One person, several SparkReels
 * accounts: link them once, by signing in to each, and their AI apps can
 * switch between them when asked. Linking is mutual and only ever made by
 * someone signed in to both accounts.
 */

export const LINK_CODE_MINUTES = 15;

export type LinkedAccount = { id: string; name: string | null; email: string | null };

const pair = (x: string, y: string) => (x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x });
const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

async function describe(admin: SupabaseClient, id: string): Promise<LinkedAccount> {
  const [{ data: prof }, { data: u }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", id).maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  return { id, name: (prof as { full_name: string | null } | null)?.full_name ?? null, email: u.user?.email ?? null };
}

/** The accounts linked to this one (not including it). */
export async function linkedAccounts(admin: SupabaseClient, userId: string): Promise<LinkedAccount[]> {
  const { data } = await admin.from("account_links").select("user_a, user_b").or(`user_a.eq.${userId},user_b.eq.${userId}`);
  const ids = ((data ?? []) as { user_a: string; user_b: string }[]).map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  return Promise.all(ids.map((id) => describe(admin, id)));
}

export async function areLinked(admin: SupabaseClient, x: string, y: string): Promise<boolean> {
  if (x === y) return true;
  const p = pair(x, y);
  const { data } = await admin.from("account_links").select("id").eq("user_a", p.user_a).eq("user_b", p.user_b).maybeSingle();
  return !!data;
}

export { describe as describeAccount };

/** "Link another account": a one-time code for the account that asked. */
export async function startLink(admin: SupabaseClient, ownerId: string): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await admin.from("account_link_codes").insert({
    code_hash: hashCode(code),
    owner_id: ownerId,
    expires_at: new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString(),
  });
  return code;
}

/** Who asked to link, if the code is still good. Doesn't use it up. */
export async function linkCodeOwner(admin: SupabaseClient, code: string): Promise<LinkedAccount | null> {
  const { data } = await admin.from("account_link_codes").select("owner_id, expires_at, used_at").eq("code_hash", hashCode(code)).maybeSingle();
  const row = data as { owner_id: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return null;
  return describe(admin, row.owner_id);
}

/**
 * Link pressed by someone signed in to the other account. The code is used
 * once (claimed before linking, so two presses can't race).
 */
export async function finishLink(
  admin: SupabaseClient,
  code: string,
  signedInId: string,
): Promise<{ ok: true; other: LinkedAccount } | { ok: false; error: string }> {
  const { data } = await admin.from("account_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashCode(code)).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("owner_id").maybeSingle();
  const ownerId = (data as { owner_id: string } | null)?.owner_id;
  if (!ownerId) return { ok: false, error: "This link has expired. Press Link another account again." };
  if (ownerId === signedInId) return { ok: false, error: "Sign in to the other account first." };
  const { error } = await admin.from("account_links").upsert(pair(ownerId, signedInId), { onConflict: "user_a,user_b", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't link them. Try again." };
  return { ok: true, other: await describe(admin, ownerId) };
}

/**
 * Unlink. Any AI connection on either account that had switched to the
 * other goes back to its own account at once.
 */
export async function unlink(admin: SupabaseClient, userId: string, otherId: string): Promise<boolean> {
  const p = pair(userId, otherId);
  const { data } = await admin.from("account_links").delete().eq("user_a", p.user_a).eq("user_b", p.user_b).select("id");
  await admin.from("agent_connections").update({ active_user_id: null }).eq("user_id", userId).eq("active_user_id", otherId);
  await admin.from("agent_connections").update({ active_user_id: null }).eq("user_id", otherId).eq("active_user_id", userId);
  return !!data?.length;
}
