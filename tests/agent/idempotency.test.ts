import { describe, it, expect, vi } from "vitest";

/**
 * Idempotency: a retry from an AI client finds the claimed action and gets
 * its stored result, so it can't make two videos, take two credits or post
 * twice. The same key with different details is refused.
 */

let existing: { id: string; status: string; result: unknown; payload_hash: string } | null = null;
let insertFails = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: async () => (insertFails ? { data: null, error: { message: "duplicate key" } } : { data: { id: "a-new" }, error: null }) }),
      }),
      select: () => {
        const b: Record<string, unknown> = {};
        b.eq = () => b;
        b.maybeSingle = async () => ({ data: existing, error: null });
        return b;
      },
    }),
  }),
}));

const actor = { userId: "u1", connectionId: null, source: "Claude", adapter: "mcp" as const, scopes: [] };

describe("claimAction", () => {
  it("a first call claims a new action", async () => {
    insertFails = false;
    const { claimAction } = await import("@/lib/agent/idempotency");
    expect(await claimAction(actor, { tool: "make_video", kind: "create", requestId: "r1", payload: { a: 1 } })).toEqual({ kind: "new", actionId: "a-new" });
  });

  it("a retry with the same details gets the stored result", async () => {
    const { claimAction, hashPayload } = await import("@/lib/agent/idempotency");
    insertFails = true;
    existing = { id: "a1", status: "succeeded", result: { sparkId: "s1" }, payload_hash: hashPayload({ a: 1 }) };
    expect(await claimAction(actor, { tool: "make_video", kind: "create", requestId: "r1", payload: { a: 1 } }))
      .toEqual({ kind: "repeat", actionId: "a1", status: "succeeded", result: { sparkId: "s1" } });
  });

  it("the same key with different details is a conflict", async () => {
    const { claimAction, hashPayload } = await import("@/lib/agent/idempotency");
    insertFails = true;
    existing = { id: "a1", status: "succeeded", result: null, payload_hash: hashPayload({ a: 1 }) };
    expect((await claimAction(actor, { tool: "make_video", kind: "create", requestId: "r1", payload: { a: 2 } })).kind).toBe("conflict");
  });

  it("derived keys are stable for identical requests within the window", async () => {
    const { requestIdFor } = await import("@/lib/agent/idempotency");
    expect(requestIdFor(actor, "publish_video", { v: 1 })).toBe(requestIdFor(actor, "publish_video", { v: 1 }));
    expect(requestIdFor(actor, "publish_video", { v: 1 })).not.toBe(requestIdFor(actor, "publish_video", { v: 2 }));
    expect(requestIdFor(actor, "publish_video", { v: 1 }, "client-key")).toBe("client-key");
  });
});
