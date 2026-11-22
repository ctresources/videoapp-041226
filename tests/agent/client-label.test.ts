import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

/** Settings → Connections shows AI clients by their friendly names. */
describe("clientLabel", () => {
  it("names the AI apps we know", async () => {
    const { clientLabel } = await import("@/lib/agent/auth/supabase-oauth");
    expect(clientLabel({ client_name: "ChatGPT Connector" })).toBe("ChatGPT");
    expect(clientLabel({ client_name: "Claude.ai" })).toBe("Claude");
    expect(clientLabel({ client_name: "Gemini custom app" })).toBe("Gemini");
    expect(clientLabel({ client_name: "Google AI" })).toBe("Gemini");
    expect(clientLabel({ client_name: "Grok Connectors" })).toBe("Grok");
    expect(clientLabel({ client_name: "xAI" })).toBe("Grok");
  });
  it("shows anything else by its own name", async () => {
    const { clientLabel } = await import("@/lib/agent/auth/supabase-oauth");
    expect(clientLabel({ client_name: "Perplexity Comet" })).toBe("Perplexity Comet");
    expect(clientLabel({ client_id: "abc123" })).toBe("abc123");
  });
});
