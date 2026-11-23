import { describe, it, expect, vi } from "vitest";
import type { AgentContext } from "@/lib/agent/context";
import type { AgentActor } from "@/lib/agent/types";
import type { PlanRow, PlanStep } from "@/lib/agent/approvals";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: vi.fn() }));

const actor = (over: Partial<AgentActor> = {}): AgentActor => ({
  userId: "u1", connectionId: "c1", source: "ChatGPT", adapter: "mcp",
  scopes: ["account:read", "sparks:plan", "sparks:write", "videos:create", "videos:read", "publish:write"], ...over,
});

const ctx = (over: Partial<AgentContext> = {}): AgentContext => ({
  userId: "u1",
  allowance: { unlimited: false, short: 3, level: "producer", tier: "agent" } as never,
  paid: true, name: "Ann", market: { city: "Blue Bell", state: "PA" }, timeZone: "America/New_York",
  myVoice: null, connected: ["youtube", "instagram"], ready: { photoAvatar: true, twin: false, clonedVoice: true },
  ...over,
});

describe("guard: who may run what", () => {
  it("free accounts get no external connection (upgrade message)", async () => {
    const { guard } = await import("@/lib/agent/guard");
    const r = guard(actor(), ctx({ paid: false }), "get_account", "account:read");
    expect(r?.code).toBe("paid_plan_required");
  });
  it("in-app Sparklee still works for free accounts", async () => {
    const { guard } = await import("@/lib/agent/guard");
    expect(guard(actor({ adapter: "in_app" }), ctx({ paid: false }), "plan_spark", "sparks:plan")).toBeNull();
  });
  it("a missing scope is refused", async () => {
    const { guard } = await import("@/lib/agent/guard");
    expect(guard(actor({ scopes: ["account:read"] }), ctx(), "make_video", "videos:create")?.code).toBe("scope_missing");
  });
  it("the eXp Hub can only plan, never make or post", async () => {
    const { guard } = await import("@/lib/agent/guard");
    expect(guard(actor({ adapter: "hub" }), ctx(), "plan_spark", "sparks:plan")).toBeNull();
    expect(guard(actor({ adapter: "hub" }), ctx(), "write_script", "sparks:write")?.code).toBe("not_in_profile");
    expect(guard(actor({ adapter: "hub" }), ctx(), "confirm_publish", "publish:write")?.code).toBe("not_in_profile");
  });
});

const plan = (status: string, steps: PlanStep[], expiresIn = 3_600_000): PlanRow => ({
  id: "p1", user_id: "u1", status, steps, totals: {}, plan_hash: "h", version: 1, summary: null,
  approval_expires_at: new Date(Date.now() + expiresIn).toISOString(),
});
const steps: PlanStep[] = [
  { n: 1, tool: "write_script", title: "", input: {}, usesVideo: false, needsConfirm: false },
  { n: 2, tool: "make_video", title: "", input: {}, usesVideo: true, needsConfirm: false },
  { n: 3, tool: "publish_video", title: "", input: {}, usesVideo: false, needsConfirm: true },
];

describe("approval state machine", () => {
  it("approve_plan authorizes creation steps", async () => {
    const { planAuthorizes } = await import("@/lib/agent/approvals");
    expect(planAuthorizes(plan("approved", steps), 2, "make_video").ok).toBe(true);
  });
  it("approve_plan never authorizes publishing or scheduling", async () => {
    const { planAuthorizes } = await import("@/lib/agent/approvals");
    const r = planAuthorizes(plan("approved", steps), 3, "publish_video");
    expect(r).toMatchObject({ ok: false, code: "needs_own_confirmation" });
  });
  it("nothing runs before approval, or after it expires", async () => {
    const { planAuthorizes } = await import("@/lib/agent/approvals");
    expect(planAuthorizes(plan("proposed", steps), 1, "write_script")).toMatchObject({ ok: false, code: "plan_not_approved" });
    expect(planAuthorizes(plan("approved", steps, -1000), 1, "write_script")).toMatchObject({ ok: false, code: "plan_expired" });
  });
  it("a step must match the approved plan", async () => {
    const { planAuthorizes } = await import("@/lib/agent/approvals");
    expect(planAuthorizes(plan("approved", steps), 1, "make_video")).toMatchObject({ ok: false, code: "step_mismatch" });
  });
});

const intent = {
  topic: "Closing costs in Blue Bell", kind: "video" as const, wantsBlog: true, wantsSocialCopy: true, shape: "vertical" as const,
  presenter: "avatar" as const, platforms: [] as string[], when: null as string | null, crmFollowUp: false, clarify: null,
};

describe("plan_spark builds only what the account can run", () => {
  it("a full plan: script, video, blog, social copy, then a post that needs its own confirmation", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const p = buildPlan(intent, ctx());
    expect(p.steps.map((s) => s.tool)).toEqual(["write_script", "make_video", "make_blog", "make_social_copy", "publish_video"]);
    expect(p.steps.find((s) => s.tool === "publish_video")?.needsConfirm).toBe(true);
    expect(p.totals.videosNeeded).toBe(1);
  });
  it("no videos left: no video step, and an upgrade opportunity shown separately", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const p = buildPlan(intent, ctx({ allowance: { unlimited: false, short: 0, level: "creator" } as never }));
    expect(p.steps.some((s) => s.tool === "make_video")).toBe(false);
    expect(p.upgrade.length).toBe(1);
  });
  it("only posts where connected, and says what isn't", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const p = buildPlan({ ...intent, platforms: ["youtube", "tiktok"] }, ctx());
    expect(p.totals.platforms).toEqual(["youtube"]);
    expect(p.totals.notConnected).toEqual(["tiktok"]);
  });
  it("the town in the goal wins over the saved market", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const p = buildPlan({ ...intent, city: "Ambler", state: "PA" }, ctx());
    expect(p.steps[0].input).toMatchObject({ city: "Ambler", state: "PA" });
  });
  it("falls back to the saved market when the goal names no town", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    expect(buildPlan(intent, ctx()).steps[0].input).toMatchObject({ city: "Blue Bell", state: "PA" });
  });
  it("no town anywhere: a customer must be asked before approving", async () => {
    const { placeFor, needsPlace } = await import("@/lib/agent/planner");
    const noMarket = ctx({ market: { city: null, state: null } });
    expect(placeFor({ city: null, state: null }, noMarket)).toBeNull();
    expect(needsPlace(noMarket)).toBe(true);
  });
  it("a town with no state isn't guessed, unless it's their own market", async () => {
    const { placeFor } = await import("@/lib/agent/planner");
    expect(placeFor({ city: "Springfield", state: null }, ctx())).toBeNull();
    expect(placeFor({ city: "blue bell", state: null }, ctx())).toEqual({ city: "blue bell", state: "PA" });
  });
  it("the owner's admin account and SparkReels mode can plan with no town", async () => {
    const { needsPlace } = await import("@/lib/agent/planner");
    expect(needsPlace(ctx({ allowance: { isRealAdmin: true } as never }))).toBe(false);
    expect(needsPlace(ctx({ allowance: { sparkreelsMode: true } as never }))).toBe(false);
  });
  it("a named time becomes a schedule step; CRM follow-up is coming soon (V1.1)", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const p = buildPlan({ ...intent, when: "2030-01-04T09:00", crmFollowUp: true }, ctx());
    expect(p.steps.some((s) => s.tool === "schedule_video" && s.needsConfirm)).toBe(true);
    expect(p.steps.find((s) => s.tool === "send_followup")?.comingSoon).toBe(true);
  });
});
