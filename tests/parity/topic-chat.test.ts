import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Parity for script revision (2026-11-22). /api/ai/topic-chat and the agent
 * tool revise_script both call topicChat(), so both follow My Voice, apply
 * the Fair Housing rule, teach My Voice from picks and edits, and only touch
 * the caller's own drafts.
 */

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));

const learn = vi.fn(async () => {});
vi.mock("@/lib/api/my-voice", () => ({
  myVoiceRuleFor: async () => "MY VOICE: short punchy sentences.",
  learnMyVoice: (...a: unknown[]) => learn(...(a as [])),
}));

const SCRIPT = "This is the agent talking about the market in town and what buyers should know this spring season right now. ".repeat(2);
const openai = vi.fn(async (_system: string, _msgs: unknown, _o: unknown): Promise<Record<string, unknown> | null> => ({ title: "New", hook: "Hook two", script: SCRIPT }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: (s: string, m: unknown, o: unknown) => openai(s, m, o) }));
vi.mock("@/lib/api/perplexity-chat", () => ({ chatJson: vi.fn(async () => null) }));

const draft = { id: "p1", title: "T", ai_script: { title: "T", hook: "Hook one", script: SCRIPT } };

beforeEach(() => { learn.mockClear(); openai.mockClear(); });

describe("topicChat (shared by /api/ai/topic-chat and revise_script)", () => {
  it("only works on the caller's own draft", async () => {
    db = fakeDb({ projects: null });
    const { topicChat } = await import("@/lib/scripts/topic-chat");
    const r = await topicChat("u1", { action: "second", projectId: "p9" });
    expect(r.status).toBe(404);
    expect(db.calls[0].filters).toContainEqual(["user_id", "u1"]);
  });

  it("writes with My Voice and the Fair Housing rule in the instructions", async () => {
    db = fakeDb({ projects: draft });
    const { topicChat } = await import("@/lib/scripts/topic-chat");
    await topicChat("u1", { action: "second", projectId: "p1" });
    const system = openai.mock.calls[0][0];
    expect(system).toContain("MY VOICE: short punchy sentences.");
    expect(system.toLowerCase()).toContain("fair housing");
  });

  it("a refine request teaches My Voice", async () => {
    db = fakeDb({ projects: draft });
    const { topicChat } = await import("@/lib/scripts/topic-chat");
    const r = await topicChat("u1", { action: "refine", projectId: "p1", message: "make it more casual" });
    expect(r.status).toBe(200);
    expect(learn).toHaveBeenCalledWith(expect.anything(), "u1", "edits", { instruction: "make it more casual" });
  });

  it("refuses an empty change request", async () => {
    db = fakeDb({ projects: draft });
    const { topicChat } = await import("@/lib/scripts/topic-chat");
    expect((await topicChat("u1", { action: "refine", projectId: "p1", message: " " })).status).toBe(400);
  });
});
