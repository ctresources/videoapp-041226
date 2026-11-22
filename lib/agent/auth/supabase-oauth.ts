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

    const granted = String(c?.scope ?? "")
      .split(/\s+/)
      .filter((s): s is Scope => ALL_SCOPES.includes(s as Scope));
    // A client that asked for no SparkReels scopes gets read-only access.
    const scopes: Scope[] = granted.length ? granted : ["account:read", "videos:read", "sparks:plan"];

    const { data: conn } = await admin
      .from("agent_connections")
      .upsert(
        { user_id: userId, kind: "oauth", client_id: clientId, client_name: clientLabel(c ?? {}), scopes, last_used_at: new Date().toISOString() },
        { onConflict: "user_id,client_id" },
      )
      .select("id, revoked_at, client_name")
      .single();
    const row = conn as { id: string; revoked_at: string | null; client_name: string } | null;
    // Disconnected in Settings: refused until they connect again.
    if (!row || row.revoked_at) return null;

    return { userId, connectionId: row.id, source: row.client_name, adapter: "mcp", scopes };
  },
};
