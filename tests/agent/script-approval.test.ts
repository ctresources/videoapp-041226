import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentContext } from "@/lib/agent/context";
import type { AgentActor } from "@/lib/agent/types";

/**
 * AI apps' script approval and video settings (2026-11-25, the owner's ask
 * after a ChatGPT video had no music, an unwanted closing line and contact
 * card, and a script she never saw).
 */

// A tiny stand-in for the database: each table answers with what's set here.
const tables: Record<string, unknown> = {};
const fakeAdmin = () => {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "is", "update", "insert"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: tables[table] ?? null });
    b.single = async () => ({ data: tables[table] ?? null });
    return b;
  };
  return { from: make, auth: { admin: { getUserById: async () => ({ data: { user: { email: "ann@example.com" } } }) } } };
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
const startRender = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ video: { id: "v1" } }), { status: 200 }));
vi.mock("@/lib/video/start-render", () => ({ startRender: (...a: unknown[]) => startRender(...a) }));
vi.mock("@/lib/api/heygen", () => ({ searchBackgroundMusic: async () => [{ audio_url: "https://music/inspiring.mp3" }], getAvatarLooks: async () => [] }));

beforeEach(() => { for (const k of Object.keys(tables)) delete tables[k]; startRender.mockClear(); });

const project = (ai: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  title: "Thanksgiving", project_type: "custom", location_city: "Ambler", location_state: "PA", ai_script: ai, ...over,
});
const profile = { full_name: "Ann Lee", company_name: "Lee Homes", location_city: "Blue Bell", location_state: "PA", default_cta: "Call {name} in {city}.", market_years: null };

describe("the closing line follows the editor's rule", () => {
  it("none, a listing's own, typed, then Settings", async () => {
    const { closingLineFor } = await import("@/lib/scripts/spoken-script");
    expect(closingLineFor(project({ cta: "Contact Ann.", cta_off: true }), profile)).toEqual({ line: "", source: "none" });
    expect(closingLineFor(project({ cta: "Book a showing." }, { project_type: "listing_video" }), profile).source).toBe("listing");
    expect(closingLineFor(project({ cta: "My own words.", user_edited: true, cta_edited: true }), profile)).toEqual({ line: "My own words.", source: "custom" });
    // The script writer's own closing line is NOT spoken: Settings is, as in the editor.
    expect(closingLineFor(project({ cta: "Contact Carmella Thompson when ready." }), profile)).toEqual({ line: "Call Ann Lee in Ambler.", source: "settings" });
  });
});

describe("the script version is tied to every word", () => {
  it("the same words give the same version; any change gives a new one", async () => {
    const { spokenFrom } = await import("@/lib/scripts/spoken-script");
    const a = spokenFrom(project({ hook: "Hi.", script: "Happy Thanksgiving to you all.", cta_off: true }), profile);
    const b = spokenFrom(project({ hook: "Hi.", script: "Happy Thanksgiving to you all.", cta_off: true }), profile);
    const c = spokenFrom(project({ hook: "Hi.", script: "Happy Thanksgiving to you all!", cta_off: true }), profile);
    const d = spokenFrom(project({ hook: "Hi.", script: "Happy Thanksgiving to you all." }), profile);
    expect(a.version).toBe(b.version);
    expect(c.version).not.toBe(a.version);
    expect(d.version).not.toBe(a.version); // a closing line added
    expect(a.spoken).toBe("Hi.\n\nHappy Thanksgiving to you all.");
    expect(d.spoken.endsWith("Call Ann Lee in Ambler.")).toBe(true);
  });
  it("says when it's too long to fit", async () => {
    const { spokenFrom } = await import("@/lib/scripts/spoken-script");
    const long = spokenFrom(project({ script: "word ".repeat(400), cta_off: true }), profile);
    expect(long.notes.join(" ")).toContain("over the");
  });
});

describe("the user's own words are saved word for word", () => {
  it("the editor's draft save keeps the text as given", async () => {
    const { draftScriptPatch } = await import("@/lib/scripts/draft-script");
    const mine = "From my heart to yours,  happy Thanksgiving.\nSee you soon";
    const out = draftScriptPatch({ hook: "Old hook", script: "Old" }, { script: mine, hook: "", ctaOff: true });
    expect(out).toMatchObject({ script: mine, hook: "", cta_off: true, user_edited: true });
  });
});

describe("video options in the plan", () => {
  it("defaults: Inspiring, captions on, closing line from Settings, contact card on", async () => {
    const { videoOptionsFrom } = await import("@/lib/agent/planner");
    expect(videoOptionsFrom({})).toEqual({ music: "inspiring", captions: true, contactCard: true, closingLine: "settings" });
  });
  it("no closing line turns the card off, unless the card is asked for", async () => {
    const { videoOptionsFrom } = await import("@/lib/agent/planner");
    expect(videoOptionsFrom({ closingLine: "none" }).contactCard).toBe(false);
    expect(videoOptionsFrom({ closingLine: "none", contactCard: true }).contactCard).toBe(true);
    expect(videoOptionsFrom({ closingText: "Happy holidays from Ann." })).toMatchObject({ closingLine: "custom", closingText: "Happy holidays from Ann." });
  });
  it("an edit keeps earlier choices it doesn't mention", async () => {
    const { videoOptionsFrom } = await import("@/lib/agent/planner");
    const first = videoOptionsFrom({ music: "jazz", closingLine: "none" });
    expect(videoOptionsFrom({ captions: false }, first)).toEqual({ music: "jazz", captions: false, contactCard: false, closingLine: "none" });
  });
  it("the plan carries them, and approving the script comes before the video", async () => {
    const { buildPlan, videoOptionsFrom } = await import("@/lib/agent/planner");
    const ctx = {
      userId: "u1", allowance: { unlimited: false, short: 3, level: "producer", tier: "agent" }, paid: true, name: "Ann",
      market: { city: "Blue Bell", state: "PA" }, timeZone: "America/New_York", myVoice: null, connected: [],
      ready: { photoAvatar: true, twin: false, clonedVoice: true }, looks: { twin: null, wide: "w", tall: "t", photoGroup: "g" },
    } as unknown as AgentContext;
    const { steps } = buildPlan({
      topic: "Thanksgiving", kind: "video", wantsBlog: false, wantsSocialCopy: false, shape: "wide", presenter: "headshot", style: "circle",
      platforms: [], when: null, crmFollowUp: false, clarify: null, options: videoOptionsFrom({ closingLine: "none", music: "bright" }),
    }, ctx);
    expect(steps.map((s) => s.tool)).toEqual(["write_script", "approve_script", "make_video"]);
    expect(steps[0].input.closing).toEqual({ line: "none" });
    expect(steps[0].title).toContain("no closing line");
    expect(steps[1].manual).toBe(true);
    expect(steps[2].input).toMatchObject({ music: "bright", captions: true, contactCard: false });
    expect(steps[2].title).toContain("contact card off");
  });
});

describe("make_video", () => {
  const actor: AgentActor = { userId: "u1", connectionId: "c1", source: "ChatGPT", adapter: "mcp", scopes: ["videos:create"] };
  const ctx = {
    userId: "u1", allowance: { unlimited: false, short: 3, level: "producer", tier: "agent" }, paid: true, name: "Ann",
    market: { city: "Blue Bell", state: "PA" }, timeZone: null, myVoice: null, connected: [],
    ready: { photoAvatar: true, twin: false, clonedVoice: true }, looks: { twin: null, wide: "w", tall: "t", photoGroup: "g" },
  } as unknown as AgentContext;

  it("refuses until the user approved the script, and shows it", async () => {
    tables.projects = project({ hook: "Hi.", script: "Happy Thanksgiving.", cta_off: true });
    tables.profiles = profile;
    tables.agent_actions = null;
    const { toolByName } = await import("@/lib/agent/tools");
    const r = await toolByName("make_video")!.run(actor, ctx, { sparkId: "s1", shape: "wide", presenter: "voice_only" });
    expect(r.code).toBe("script_not_approved");
    expect(r.data).toMatchObject({ sparkId: "s1", hook: "Hi.", script: "Happy Thanksgiving.", closingLine: "(none)" });
    expect(startRender).not.toHaveBeenCalled();
  });
});

describe("the render gets exactly what was approved", () => {
  it("no closing line, no contact card, the music and captions chosen", async () => {
    tables.projects = { ai_script: { hook: "Hi.", script: "Happy Thanksgiving.", cta: "Contact Carmella Thompson." } };
    const { renderSparkVideo } = await import("@/lib/halo/make");
    const r = await renderSparkVideo(fakeAdmin() as never, { id: "u1", email: null }, "s1",
      { size: "horizontal", look: "circle", lookId: "w", captions: false, music: "inspiring" } as never,
      { cta: "", contactCard: false });
    expect(r.status).toBe(200);
    const body = startRender.mock.calls[0][1] as Record<string, unknown>;
    expect(body).toMatchObject({ cta: "", contactCard: false, captions: false, musicUrl: "https://music/inspiring.mp3", avatarStyle: "circle", engine: "direct" });
  });
  it("without the AI app's choices, a draft renders as before", async () => {
    tables.projects = { ai_script: { hook: "Hi.", script: "Happy Thanksgiving.", cta: "Call me." } };
    const { renderSparkVideo } = await import("@/lib/halo/make");
    await renderSparkVideo(fakeAdmin() as never, { id: "u1", email: null }, "s1", { size: "horizontal", look: "full", lookId: "w", captions: true, music: "none" } as never);
    const body = startRender.mock.calls[0][1] as Record<string, unknown>;
    expect(body.cta).toBe("Call me.");
    expect("contactCard" in body).toBe(false);
  });
});

describe("the video prompt with the contact card off", () => {
  it("asks for no card, phone or website", async () => {
    const real = await vi.importActual<typeof import("@/lib/video/start-render")>("@/lib/video/start-render");
    const base = { script: "Hi.", city: "Ambler", state: "PA", keywords: [], isShortForm: false, hasAvatar: true, phone1: "215-555-0100", website: "lee.com", agentName: "Ann" };
    const on = real.buildVideoAgentPrompt(base).head;
    const off = real.buildVideoAgentPrompt({ ...base, noContactCard: true }).head;
    expect(on).toContain("CTA CONTACT CARD");
    expect(off).not.toContain("CTA CONTACT CARD");
    expect(off).not.toContain("215-555-0100");
    expect(off).toContain("No contact card");
  });
});
