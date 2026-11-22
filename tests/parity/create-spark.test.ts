import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Parity for script creation (2026-11-22). /api/ai/generate-location-script
 * and the agent tool write_script both call createSparkScript(), so both get
 * the same validation, My Voice, free-trial blog gate and saved project.
 */

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));
vi.mock("@/lib/utils/ensure-spark", () => ({ ensureSparkFor: vi.fn(async () => {}) }));
vi.mock("@/lib/sparkreels-mode", () => ({ isSparkreelsMode: async () => false, sparkreelsFacts: () => "" }));
vi.mock("@/lib/api/my-voice", () => ({ myVoiceRuleFor: async () => "MY VOICE: warm and direct." }));
vi.mock("@/lib/utils/script-budget", () => ({
  closingLineWords: async () => 30,
  shortScriptBudget: () => ({ target: 200, cap: 260 }),
}));
const probe = vi.fn();
vi.mock("@/lib/security/probe", () => ({ noteProbe: (o: unknown) => probe(o) }));
vi.mock("@/lib/api/perplexity", () => ({ generateYoutubeMetadata: async () => null }));

const writerParams: unknown[] = [];
vi.mock("@/lib/api/perplexity-prompts", () => ({
  generateLocationScript: async (_t: string, params: unknown) => { writerParams.push(params); return "RAW"; },
  parseLocationScript: () => ({
    title: "Title", hook: "Opening line here", hooks: [], script: "Body of the script about the town. ".repeat(10),
    cta: "Call me today.", description: "Desc", hashtags: [], keywords: [], blog_intro: "Intro",
    blog_body: "Blog body", blog_conclusion: "End", sources: [], raw: "RAW", video_type: "custom", location: "Blue Bell, PA",
  }),
}));

let trialLocked = false;
vi.mock("@/lib/utils/free-trial", () => ({
  freeTrialLocked: () => trialLocked,
  freeBlogAvailable: async () => false,
  isPreVideoAccount: () => false,
  markFreeBlog: vi.fn(async () => {}),
}));

const profile = { full_name: "Ann", subscription_tier: "starter", role: null, first_video_generated_at: "2026-11-01" };

beforeEach(() => { writerParams.length = 0; probe.mockClear(); trialLocked = false; });

describe("createSparkScript (shared by generate-location-script and write_script)", () => {
  it("refuses a custom topic with no topic", async () => {
    db = fakeDb({ profiles: profile });
    const { createSparkScript } = await import("@/lib/scripts/create-spark");
    const r = await createSparkScript("u1", { videoType: "custom", city: "Blue Bell", state: "PA" });
    expect(r.status).toBe(400);
  });

  it("writes in the agent's My Voice", async () => {
    db = fakeDb({ profiles: profile, projects: { id: "p1" } });
    const { createSparkScript } = await import("@/lib/scripts/create-spark");
    await createSparkScript("u1", { videoType: "custom", city: "Blue Bell", state: "PA", customTopic: "Closing costs" });
    expect(writerParams[0]).toMatchObject({ myVoice: "MY VOICE: warm and direct." });
  });

  it("saves the draft under the caller and checks typed topics for probes", async () => {
    db = fakeDb({ profiles: profile, projects: { id: "p1" } });
    const { createSparkScript } = await import("@/lib/scripts/create-spark");
    const r = await createSparkScript("u1", { videoType: "custom", city: "Blue Bell", state: "PA", customTopic: "Closing costs" });
    expect(r.status).toBe(200);
    const insert = db.calls.find((c) => c.table === "projects" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ user_id: "u1", status: "draft" });
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", source: "create-topic" }));
  });

  it("drops the blog when the free trial is closed (both doors)", async () => {
    trialLocked = true;
    db = fakeDb({ profiles: { ...profile, subscription_tier: "free" }, projects: { id: "p1" } });
    const { createSparkScript } = await import("@/lib/scripts/create-spark");
    await createSparkScript("u1", { videoType: "custom", city: "Blue Bell", state: "PA", customTopic: "Closing costs" });
    const insert = db.calls.find((c) => c.table === "projects" && c.op === "insert");
    expect((insert?.payload as { ai_script: Record<string, string> }).ai_script.blog_body).toBe("");
  });

  it("Autopilot's own topics aren't probe-checked", async () => {
    db = fakeDb({ profiles: profile, projects: { id: "p1" } });
    const { createSparkScript } = await import("@/lib/scripts/create-spark");
    await createSparkScript("u1", { videoType: "custom", city: "Blue Bell", state: "PA", customTopic: "Closing costs" }, { fromAutopilot: true });
    expect(probe).not.toHaveBeenCalled();
  });
});
