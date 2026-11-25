import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, type AuthProvider } from "@/lib/agent/auth";
import { activeAccount } from "@/lib/agent/auth/active-account";
import { ALL_SCOPES, type AgentActor, type Scope } from "@/lib/agent/types";

/**
 * Personal access keys: the advanced fallback for AI clients that only take
 * a key. Named by the user, scoped, shown once, stored only as a SHA-256 hash,
 * last use recorded, optional expiry, revocable one at a time.
 */
export const KEY_PREFIX = "sr_pat_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createPersonalKey(
  userId: string,
  opts: { name: string; scopes: Scope[]; expiresInDays?: number | null },
): Promise<{ id: string; key: string; prefix: string }> {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const prefix = key.slice(0, KEY_PREFIX.length + 4);
  const scopes = opts.scopes.filter((s) => ALL_SCOPES.includes(s));
  const expires = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString() : null;
  const { data, error } = await createAdminClient()
    .from("agent_connections")
    .insert({
      user_id: userId,
      kind: "key",
      client_name: opts.name.trim().slice(0, 60) || "Personal key",
      scopes,
      key_prefix: prefix,
      key_hash: hashKey(key),
      expires_at: expires,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't create the key.");
  // The only time the full key exists outside the caller's hands.
  return { id: (data as { id: string }).id, key, prefix };
}

export const personalKeyProvider: AuthProvider = {
  async resolve(req: Request): Promise<AgentActor | null> {
    const token = bearerToken(req);
    if (!token?.startsWith(KEY_PREFIX)) return null;
    const admin = createAdminClient();
    const { data } = await admin
      .from("agent_connections")
      .select("id, user_id, client_name, scopes, expires_at, revoked_at, active_user_id")
      .eq("key_hash", hashKey(token))
      .eq("kind", "key")
      .maybeSingle();
    const row = data as { id: string; user_id: string; client_name: string; scopes: string[]; expires_at: string | null; revoked_at: string | null; active_user_id?: string | null } | null;
    if (!row || row.revoked_at) return null;
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;
    await admin.from("agent_connections").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    return {
      userId: await activeAccount(admin, row.id, row.user_id, row.active_user_id ?? null),
      ownerUserId: row.user_id,
      connectionId: row.id,
      source: row.client_name,
      adapter: "mcp",
      scopes: row.scopes.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope)),
    };
  },
};
