import { describe, it, expect, vi } from "vitest";

/**
 * The MCP adapter only translates: initialize, tools/list (filtered by the
 * connection's scopes) and tools/call → runAgent. No business logic here.
 */
const runAgent = vi.fn(async (_o: unknown) => ({ status: "needs_approval", message: "Recommended Spark Plan: …", planId: "p1" }));
vi.mock("@/lib/agent", () => ({ runAgent: (o: unknown) => runAgent(o) }));
// The real tool list pulls in the render and payment services; the adapter
// only needs names, scopes and schemas.
vi.mock("@/lib/agent/tools", () => ({
  TOOLS: [
    { name: "get_account", scope: "account:read", description: "", input: {} },
    { name: "plan_spark", scope: "sparks:plan", description: "", input: {} },
    { name: "make_video", scope: "videos:create", description: "", input: {} },
    { name: "confirm_publish", scope: "publish:write", description: "", input: {} },
  ],
}));

const actor = { userId: "u1", connectionId: "c1", source: "Claude", adapter: "mcp" as const, scopes: ["account:read" as const, "sparks:plan" as const] };

describe("MCP adapter", () => {
  it("initializes with SparkReels' plan-first instructions", async () => {
    const { handleMcpMessage } = await import("@/lib/agent/mcp");
    const r = await handleMcpMessage(actor, { jsonrpc: "2.0", id: 1, method: "initialize" }) as { result: { instructions: string; serverInfo: { name: string } } };
    expect(r.result.serverInfo.name).toBe("SparkReels");
    expect(r.result.instructions).toContain("plan_spark");
  });

  it("lists only the tools this connection's scopes allow", async () => {
    const { handleMcpMessage } = await import("@/lib/agent/mcp");
    const r = await handleMcpMessage(actor, { jsonrpc: "2.0", id: 2, method: "tools/list" }) as { result: { tools: { name: string }[] } };
    const names = r.result.tools.map((t) => t.name);
    expect(names).toContain("plan_spark");
    expect(names).toContain("get_account");
    expect(names).not.toContain("make_video");
    expect(names).not.toContain("confirm_publish");
  });

  it("tools/call goes straight to the shared agent layer", async () => {
    const { handleMcpMessage } = await import("@/lib/agent/mcp");
    const r = await handleMcpMessage(actor, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "plan_spark", arguments: { goal: "Market my listing" } } }) as { result: { structuredContent: { planId: string } } };
    expect(runAgent).toHaveBeenCalledWith({ actor, tool: "plan_spark", input: { goal: "Market my listing" } });
    expect(r.result.structuredContent.planId).toBe("p1");
  });

  it("notifications get no reply", async () => {
    const { handleMcpMessage } = await import("@/lib/agent/mcp");
    expect(await handleMcpMessage(actor, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
});
