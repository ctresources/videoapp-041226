import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, type AuthProvider } from "@/lib/agent/auth";
import { KEY_PREFIX } from "@/lib/agent/auth/personal-key";
import { ALL_SCOPES, type AgentActor, type Scope } from "@/lib/agent/types";
import { clientLabel } from "@/lib/agent/client-label";

/**
 * Primary sign-in: access tokens issued by Supabase's OAuth 2.1 server
 * (which supports MCP authentication; in beta as of 2026-11-22).
 *
 * The token is checked by Supabase Auth itself (signature, expiry, user),
 * then its claims say which OAuth client it was issued to and which scopes
 * were approved. Each client gets one agent_connections row per user, so
 * Settings → Connections can list it, show last use, and revoke it.
 *
 * Kept behind AuthProvider: replacing Supabase's OAuth server touches only
 * this file.
 */

function claims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Friendly client names live in one pure module, shared with the consent page. */
export { clientLabel };

export const supabaseOAuthProvider: AuthProvider = {
  async resolve(req: Request): Promise<AgentActor | null> {
    const token = bearerToken(req);
    if (!token || token.startsWith(KEY_PREFIX)) return null;
    const c = claims(token);
    // Only OAuth-issued tokens: a plain session token has no client_id.
    const clientId = c && typeof c.client_id === "string" ? c.client_id : null;
    if (!clientId) return null;

    const admin = createAdminClient();
    // Supabase verifies the token; a forged or expired one returns no user.
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    const userId = data.user.id;

    // SparkReels' permissions come from the connection the person approved on
    // the consent page (agent_connections), not from the token: Supabase's
    // OAuth server only issues its own standard scopes (tested 2026-11-22).
    const { data: existing } = await admin
      .from("agent_connections")
      .select("id, revoked_at, client_name, scopes")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .eq("kind", "oauth")
      .maybeSingle();
    let row = existing as { id: string; revoked_at: string | null; client_name: string; scopes: string[] } | null;
    if (!row) {
      // Approved somewhere the consent page didn't record: read-only until reconnected.
      const { data: made } = await admin
        .from("agent_connections")
        .insert({ user_id: userId, kind: "oauth", client_id: clientId, client_name: clientLabel(c ?? {}), scopes: ["account:read", "videos:read", "sparks:plan"] })
        .select("id, revoked_at, client_name, scopes")
        .single();
      row = made as typeof row;
    }
    // Disconnected in Settings: refused until they connect again.
    if (!row || row.revoked_at) return null;
    await admin.from("agent_connections").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

    const scopes = row.scopes.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope));
    return { userId, connectionId: row.id, source: row.client_name, adapter: "mcp", scopes };
  },
};
