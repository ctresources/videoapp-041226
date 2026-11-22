import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Settings → Connections and the consent return path (2026-11-22).
 * Keys are for paid plans; Disconnect/Revoke always works and only on the
 * caller's own rows; login can only send people back to the consent page.
 */

let db = fakeDb();
let profile: { subscription_tier: string | null; role: string | null } = { subscription_tier: "starter", role: null };
const revokeGrant = vi.fn(async () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), oauth: { revokeGrant } },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  }),
}));
const createKey = vi.fn(async () => ({ id: "k1", key: "sr_pat_secret", prefix: "sr_pat_secr" }));
vi.mock("@/lib/agent/auth/personal-key", () => ({ createPersonalKey: (...a: unknown[]) => createKey(...(a as [])) }));

const req = (method: string, body: unknown) => new Request("http://x", { method, body: JSON.stringify(body) }) as never;

beforeEach(() => { createKey.mockClear(); revokeGrant.mockClear(); });

describe("personal access keys", () => {
  it("free accounts can't create one", async () => {
    profile = { subscription_tier: "free", role: null };
    const { POST } = await import("@/app/api/agent/connections/route");
    const r = await POST(req("POST", { action: "create_key", name: "Zapier", scopes: ["account:read"] }));
    expect(r.status).toBe(403);
    expect(createKey).not.toHaveBeenCalled();
  });

  it("paid accounts get the key once, with only real scopes", async () => {
    profile = { subscription_tier: "starter", role: null };
    const { POST } = await import("@/app/api/agent/connections/route");
    const r = await POST(req("POST", { action: "create_key", name: "Zapier", scopes: ["account:read", "be:admin"], expiresInDays: 90 }));
    expect(await r.json()).toMatchObject({ key: "sr_pat_secret" });
    expect(createKey).toHaveBeenCalledWith("u1", { name: "Zapier", scopes: ["account:read"], expiresInDays: 90 });
  });
});

describe("disconnect / revoke", () => {
  it("only touches the caller's own connection, and ends an app's OAuth grant", async () => {
    db = fakeDb({ agent_connections: { kind: "oauth", client_id: "client-9" } });
    const { DELETE } = await import("@/app/api/agent/connections/route");
    const r = await DELETE(req("DELETE", { id: "c1" }));
    expect(r.status).toBe(200);
    expect(db.calls[0].filters).toContainEqual(["user_id", "u1"]);
    expect(revokeGrant).toHaveBeenCalledWith({ clientId: "client-9" });
  });
});

describe("consentReturnPath", () => {
  it("only allows the consent page on this site", async () => {
    const { consentReturnPath } = await import("@/lib/utils/safe-next");
    expect(consentReturnPath("/oauth/consent?authorization_id=abc-123")).toBe("/oauth/consent?authorization_id=abc-123");
    expect(consentReturnPath("https://evil.example/oauth/consent")).toBeNull();
    expect(consentReturnPath("//evil.example")).toBeNull();
    expect(consentReturnPath("/settings")).toBeNull();
    expect(consentReturnPath(null)).toBeNull();
  });
});
