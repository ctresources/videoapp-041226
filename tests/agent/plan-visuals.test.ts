import { describe, it, expect, vi } from "vitest";
import type { AgentContext } from "@/lib/agent/context";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: vi.fn() }));
vi.mock("@/lib/utils/rehost-images", () => ({ storeImageBuffer: vi.fn() }));

const ctx = {
  userId: "u1",
  allowance: { unlimited: false, short: 3, level: "producer", tier: "agent" },
  paid: true, name: "Ann", market: { city: "Blue Bell", state: "PA" }, timeZone: "America/New_York",
  myVoice: null, connected: ["youtube"], ready: { photoAvatar: true, twin: false, clonedVoice: true },
  looks: { twin: null, wide: "w", tall: "t", photoGroup: "g" },
} as unknown as AgentContext;

const intent = {
  topic: "Closing costs", kind: "video" as const, wantsBlog: false, wantsSocialCopy: false,
  shape: "wide" as const, presenter: "headshot" as const, style: "full" as "full" | "circle",
  platforms: [] as string[], when: null, crmFollowUp: false, clarify: null,
};

describe("image links from an AI client", () => {
  it("allows only public https links", async () => {
    const { isAllowedImageLink } = await import("@/lib/agent/plan-visuals");
    expect(isAllowedImageLink("https://example.com/a.png")).toBe(true);
    for (const bad of [
      "http://example.com/a.png", "file:///etc/passwd", "https://localhost/a.png", "https://x.internal/a.png",
      "https://127.0.0.1/a.png", "https://10.0.0.5/a.png", "https://169.254.169.254/latest/meta-data",
      "https://[::1]/a.png", "https://[::ffff:127.0.0.1]/a.png", "https://user:pw@example.com/a.png", "https://example.com:8443/a.png",
    ]) expect(isAllowedImageLink(bad), bad).toBe(false);
  });
  it("refuses private addresses at connection time", async () => {
    const { isPublicIp } = await import("@/lib/agent/plan-visuals");
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
    for (const bad of ["127.0.0.1", "10.1.1.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "nope"]) {
      expect(isPublicIp(bad), bad).toBe(false);
    }
  });
});

describe("on-screen labels (backup for an old tool list)", () => {
  it("reads them and keeps them out of the topic", async () => {
    const { labeledVisuals, withoutVisualLabels } = await import("@/lib/agent/plan-visuals");
    const goal = "Closing costs in Ambler. Shape: Wide. On screen: my website homepage, then a chart. Images: https://example.com/a.png, https://example.com/b.jpg. Style: Full";
    expect(labeledVisuals(goal)).toEqual({
      direction: "my website homepage, then a chart.",
      images: ["https://example.com/a.png", "https://example.com/b.jpg"],
    });
    const clean = withoutVisualLabels(goal);
    expect(clean).not.toMatch(/example\.com|homepage/);
    expect(clean).toContain("Closing costs in Ambler");
    expect(clean).toContain("Style: Full");
  });
  it("loose wording doesn't count", async () => {
    const { labeledVisuals } = await import("@/lib/agent/plan-visuals");
    expect(labeledVisuals("A video showing my website with images of homes")).toEqual({ direction: "", images: [] });
  });
});

describe("the plan carries what to show", () => {
  it("a Full AI Avatar step gets the direction and images", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const { steps, totals, notes } = buildPlan({ ...intent, visuals: { direction: "Show my homepage", images: [{ source: "https://e.com/a.png", url: "https://own/a.jpg" }] } }, ctx);
    const video = steps.find((s) => s.tool === "make_video");
    expect(video?.input).toMatchObject({ visualDirection: "Show my homepage", images: ["https://own/a.jpg"] });
    expect((totals as { visuals?: unknown }).visuals).toBeTruthy();
    expect(notes.join(" ")).toContain("On screen: Show my homepage");
  });
  it("a circle video keeps the images and says the direction doesn't apply", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const { steps, warnings } = buildPlan({ ...intent, style: "circle", visuals: { direction: "Show my homepage", images: [{ source: "https://e.com/a.png", url: "https://own/a.jpg" }] } }, ctx);
    const video = steps.find((s) => s.tool === "make_video");
    expect(video?.input.visualDirection).toBeUndefined();
    expect(video?.input.images).toEqual(["https://own/a.jpg"]);
    expect(warnings.join(" ")).toContain("won't be used");
  });
  it("says real screens need an image", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const { notes } = buildPlan({ ...intent, visuals: { direction: "Show my homepage", images: [] } }, ctx);
    expect(notes.join(" ")).toContain("Real website or app screens appear only from images");
  });
  it("a plan with no visuals is unchanged", async () => {
    const { buildPlan } = await import("@/lib/agent/planner");
    const { steps, totals } = buildPlan(intent, ctx);
    expect(steps.find((s) => s.tool === "make_video")?.input).toEqual({ sparkFromStep: 1, size: "wide", voiceOnly: false, presenter: "headshot", style: "full", music: "inspiring", captions: true, contactCard: true });
    expect("visuals" in totals).toBe(false);
  });
});

describe("direction text", () => {
  it("is one short clean line", async () => {
    const { cleanVisualDirection, VISUAL_DIRECTION_MAX } = await import("@/lib/utils/visual-direction");
    expect(cleanVisualDirection('Show "my site"\n\nthen a chart')).toBe("Show 'my site' then a chart");
    expect(cleanVisualDirection("word ".repeat(200)).length).toBeLessThanOrEqual(VISUAL_DIRECTION_MAX);
    expect(cleanVisualDirection(42)).toBe("");
  });
  it("gets only the room the script leaves", async () => {
    const { fitVisualDirection } = await import("@/lib/utils/visual-direction");
    const text = "Show my website homepage first and then a market chart with the latest local numbers";
    expect(fitVisualDirection(text, 500)).toBe(text);
    const part = fitVisualDirection(text, 50);
    expect(part.length).toBeLessThanOrEqual(50);
    expect(text.startsWith(part)).toBe(true);
    expect(text.charAt(part.length)).toBe(" ");
    expect(fitVisualDirection(text, 39)).toBe("");
    expect(fitVisualDirection(text, -100)).toBe("");
  });
});
