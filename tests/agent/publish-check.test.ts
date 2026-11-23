import { beforeEach, describe, it, expect, vi } from "vitest";
import type { AgentContext } from "@/lib/agent/context";
import type { AgentActor } from "@/lib/agent/types";

/**
 * The first live test (2026-11-23) put one video on YouTube twice, under a
 * title the preview never showed. These hold both rules at the tool level.
 */

const state = vi.hoisted(() => ({
  video: null as unknown,
  posts: [] as { platform: string; post_status: string; posted_at: string | null; scheduled_at: string | null; created_at: string }[],
  action: null as unknown,
  updates: [] as Record<string, unknown>[],
  postsError: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      let platforms: string[] | null = null;
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b, order: () => b, limit: () => b,
        in: (col: string, vals: string[]) => { if (col === "platform") platforms = vals; return b; },
        update: (p: Record<string, unknown>) => { state.updates.push(p); return b; },
        maybeSingle: async () => ({ data: table === "generated_videos" ? state.video : state.action }),
        then: (done: (r: unknown) => void) => done(state.postsError
          ? { data: null, error: { message: "down" } }
          : { data: state.posts.filter((p) => ["posted", "posting", "scheduled"].includes(p.post_status) && (!platforms || platforms.includes(p.platform))), error: null }),
      };
      return b;
    },
  }),
}));
const publishToTargets = vi.hoisted(() => vi.fn(async () => ({ status: 200, body: { success: true } })));
const claimAction = vi.hoisted(() => vi.fn(async () => ({ kind: "new", actionId: "a1" })));
vi.mock("@/lib/social/publish", () => ({ publishToTargets }));
vi.mock("@/lib/agent/idempotency", () => ({ claimAction, finishAction: vi.fn(), requestIdFor: () => "r1" }));
vi.mock("@/lib/scripts/create-spark", () => ({ createSparkScript: vi.fn() }));
vi.mock("@/lib/scripts/topic-chat", () => ({ topicChat: vi.fn() }));
vi.mock("@/lib/content/blog", () => ({ writeBlog: vi.fn() }));
vi.mock("@/lib/content/share-kit", () => ({ writeShareKit: vi.fn() }));
vi.mock("@/lib/halo/make", () => ({ renderSparkVideo: vi.fn() }));
vi.mock("@/lib/video/status", () => ({ getRenderStatus: vi.fn() }));
vi.mock("@/lib/api/heygen", () => ({ getAvatarLooks: vi.fn() }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: vi.fn() }));
vi.mock("@/lib/agent/plan-picture", () => ({ pictureForPlan: vi.fn() }));
vi.mock("@/lib/agent/plan-visuals", () => ({
  MAX_PLAN_IMAGES: 6, imageLinks: vi.fn(), imagesForPlan: vi.fn(), labeledVisuals: vi.fn(), visualsFrom: vi.fn(), withoutVisualLabels: vi.fn(),
}));

const actor = { userId: "u1", connectionId: "c1", source: "ChatGPT", adapter: "mcp", scopes: [] } as unknown as AgentActor;
const ctx = { userId: "u1", connected: ["youtube", "linkedin"], timeZone: "America/New_York" } as unknown as AgentContext;
const yt = { platform: "youtube", post_status: "posted", posted_at: "2026-11-23T20:20:29Z", scheduled_at: null, created_at: "2026-11-23T20:20:29Z" };

const run = async (name: string, input: Record<string, unknown>) => {
  const { toolByName } = await import("@/lib/agent/tools");
  return toolByName(name)!.run(actor, ctx, input) as Promise<{ status: string; code?: string; message: string; data?: Record<string, unknown> }>;
};

beforeEach(() => {
  state.posts = [];
  state.updates = [];
  state.postsError = false;
  state.video = {
    id: "v1", render_status: "completed", video_url: "https://x/v.mp4", project_id: "p1",
    projects: {
      title: "A very long working title for the project",
      ai_script: { title: "The script title", hook: "The hook" },
      seo_data: { youtube_title: "The Share Kit title", youtube_description: "The description", instagram_caption: "The caption", linkedin_post: "The LinkedIn post" },
    },
  };
  state.action = { id: "a1", kind: "publish", status: "prepared", expires_at: new Date(Date.now() + 60_000).toISOString(), payload: { videoId: "v1", targets: [{ platform: "youtube" }] } };
  publishToTargets.mockClear();
  claimAction.mockClear();
});

describe("no duplicate posts", () => {
  it("won't prepare a video already on that account", async () => {
    state.posts = [yt];
    const r = await run("publish_video", { videoId: "v1", platforms: ["youtube"] });
    expect(r).toMatchObject({ status: "needs_input", code: "already_posted" });
    expect(r.message).toContain("already posted to YouTube");
    expect(claimAction).not.toHaveBeenCalled();
  });
  it("posts to the accounts it isn't on and says which it left out", async () => {
    state.posts = [yt];
    const r = await run("publish_video", { videoId: "v1", platforms: ["youtube", "linkedin"] });
    expect(r.status).toBe("needs_approval");
    expect(r.data?.destinations).toEqual(["LinkedIn"]);
    expect(r.message).toContain("left out");
  });
  it("a failed post can be tried again", async () => {
    state.posts = [{ ...yt, post_status: "failed" }];
    const r = await run("publish_video", { videoId: "v1", platforms: ["youtube"] });
    expect(r.status).toBe("needs_approval");
  });
  it("a second copy needs asking for, and says so", async () => {
    state.posts = [yt];
    const r = await run("publish_video", { videoId: "v1", platforms: ["youtube"], postAgain: true });
    expect(r.status).toBe("needs_approval");
    expect(r.message).toContain("SECOND copy");
  });
  it("refuses at confirmation if it was posted after being prepared", async () => {
    state.posts = [yt];
    const r = await run("confirm_publish", { actionId: "a1" });
    expect(r).toMatchObject({ status: "needs_input", code: "already_posted" });
    expect(publishToTargets).not.toHaveBeenCalled();
    expect(state.updates[0]).toMatchObject({ status: "cancelled" });
  });
  it("posts nothing if it can't check", async () => {
    state.postsError = true;
    const r = await run("confirm_publish", { actionId: "a1" });
    expect(r.code).toBe("post_check_failed");
    expect(publishToTargets).not.toHaveBeenCalled();
  });
  it("a confirmed second copy goes out, without the internal flag", async () => {
    state.posts = [yt];
    state.action = { ...(state.action as object), payload: { videoId: "v1", targets: [{ platform: "youtube" }], postAgain: true } };
    await run("confirm_publish", { actionId: "a1" });
    expect(publishToTargets).toHaveBeenCalledTimes(1);
    expect((publishToTargets.mock.calls[0] as unknown[])[1]).toEqual({ videoId: "v1", targets: [{ platform: "youtube" }] });
  });
});

describe("the preview is what posts", () => {
  it("saves the Share Kit's title and text on the prepared post", async () => {
    const r = await run("publish_video", { videoId: "v1", platforms: ["youtube", "linkedin"] });
    expect(r.data?.title).toBe("The Share Kit title");
    expect(r.message).toContain('"The Share Kit title"');
    expect(r.data?.posts).toEqual([
      { platform: "YouTube", title: "The Share Kit title", text: "The description" },
      { platform: "LinkedIn", title: "The Share Kit title", text: "The LinkedIn post" },
    ]);
    const saved = (claimAction.mock.calls[0] as unknown as [unknown, { payload: { targets: Record<string, unknown>[] } }])[1].payload.targets;
    expect(saved[0]).toMatchObject({ platform: "youtube", title: "The Share Kit title", description: "The description" });
    expect(saved[1]).toMatchObject({ platform: "linkedin", title: "The Share Kit title", caption: "The caption" });
  });
  it("falls back in order and keeps YouTube's 100-character limit", async () => {
    const { postCopyFor } = await import("@/lib/agent/publish-check");
    expect(postCopyFor({ title: "Project", ai_script: { title: "Script" }, seo_data: {} }).title).toBe("Script");
    expect(postCopyFor({ title: "Project" }).title).toBe("Project");
    expect(postCopyFor({ title: "x".repeat(192) }).title.length).toBe(100);
  });
});
