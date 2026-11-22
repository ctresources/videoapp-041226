import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Parity for the blog and Share Kit (2026-11-22). The app's routes
 * (/api/ai/blog, /api/ai/share-kit) and the agent tools (make_blog,
 * make_social_copy) both call writeBlog / writeShareKit, so they share the
 * free-trial gate, the ownership check, the reuse rule and the refusals.
 */

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));

const gate = vi.fn(async (_u?: string, _o?: unknown): Promise<Response | null> => null);
vi.mock("@/lib/utils/free-trial", () => ({ freeTrialGateResponse: (u: string, o: unknown) => gate(u, o) }));

const writer = vi.fn(async () => ({ headline: "H", intro: "I", body: "B", conclusion: "C" }));
vi.mock("@/lib/api/blog-writer", () => ({ generateBlogFromScript: (...a: unknown[]) => writer(...(a as [])) }));
const seoWriter = vi.fn(async () => ({ linkedin_post: "L", facebook_post: "F", instagram_caption: "I" }));
vi.mock("@/lib/api/perplexity", () => ({ generateSeoData: (...a: unknown[]) => seoWriter(...(a as [])) }));
vi.mock("@/lib/utils/video-srt", () => ({ ensureVideoSrt: vi.fn(async () => ({ ok: false })) }));

const LONG = "word ".repeat(80);

beforeEach(() => { gate.mockClear(); writer.mockClear(); seoWriter.mockClear(); });

describe("writeBlog (shared by /api/ai/blog and make_blog)", () => {
  it("passes the free-trial gate's refusal through unchanged", async () => {
    gate.mockResolvedValueOnce(new Response(JSON.stringify({ error: "trial over" }), { status: 402 }));
    const { writeBlog } = await import("@/lib/content/blog");
    expect(await writeBlog("u1", { projectId: "p1" })).toEqual({ status: 402, body: { error: "trial over" } });
    expect(writer).not.toHaveBeenCalled();
  });

  it("blocks pre-video accounts only for automatic writes", async () => {
    db = fakeDb({ projects: null });
    const { writeBlog } = await import("@/lib/content/blog");
    await writeBlog("u1", { projectId: "p1", auto: true });
    expect(gate).toHaveBeenLastCalledWith("u1", { preVideo: "block" });
    await writeBlog("u1", { projectId: "p1" });
    expect(gate).toHaveBeenLastCalledWith("u1", undefined);
  });

  it("only reads the caller's own project", async () => {
    db = fakeDb({ projects: null });
    const { writeBlog } = await import("@/lib/content/blog");
    const r = await writeBlog("u1", { projectId: "someone-elses" });
    expect(r.status).toBe(404);
    expect(db.calls[0].filters).toContainEqual(["user_id", "u1"]);
  });

  it("reuses an existing article instead of paying for a new one", async () => {
    db = fakeDb({ projects: { id: "p1", ai_script: { blog_body: "Existing", blog_intro: "x" } } });
    const { writeBlog } = await import("@/lib/content/blog");
    const r = await writeBlog("u1", { projectId: "p1" });
    expect(r.body).toMatchObject({ reused: true, blog: { body: "Existing" } });
    expect(writer).not.toHaveBeenCalled();
  });

  it("refuses to invent an article from too few words", async () => {
    db = fakeDb({ projects: { id: "p1", ai_script: { script: "Too short." } }, generated_videos: null });
    const { writeBlog } = await import("@/lib/content/blog");
    expect((await writeBlog("u1", { projectId: "p1" })).status).toBe(422);
  });

  it("writes and saves the four blog fields", async () => {
    db = fakeDb({ projects: { id: "p1", ai_script: { script: LONG, title: "T" } }, profiles: { full_name: "Ann" } });
    const { writeBlog } = await import("@/lib/content/blog");
    const r = await writeBlog("u1", { projectId: "p1" });
    expect(r.body).toMatchObject({ saved: true, blog: { body: "B" } });
    const update = db.calls.find((c) => c.op === "update");
    expect(update?.payload).toMatchObject({ ai_script: { blog_headline: "H", blog_intro: "I", blog_body: "B", blog_conclusion: "C" } });
  });
});

describe("writeShareKit (shared by /api/ai/share-kit and make_social_copy)", () => {
  it("keeps wording someone already wrote unless forced", async () => {
    db = fakeDb({
      projects: { id: "p1", ai_script: { script: LONG, blog_body: "B0" }, seo_data: { linkedin_post: "Mine" } },
      profiles: { full_name: "Ann" },
    });
    const { writeShareKit } = await import("@/lib/content/share-kit");
    const r = await writeShareKit("u1", { projectId: "p1" });
    expect((r.body as { seo: Record<string, string> }).seo.linkedin_post).toBe("Mine");
    expect((r.body as { seo: Record<string, string> }).seo.facebook_post).toBe("F");
  });

  it("refuses with too few words", async () => {
    db = fakeDb({ projects: { id: "p1", ai_script: { script: "Hi" }, seo_data: {} }, generated_videos: null });
    const { writeShareKit } = await import("@/lib/content/share-kit");
    expect((await writeShareKit("u1", { projectId: "p1" })).status).toBe(422);
  });
});

describe("routes are thin doors onto the services", () => {
  it("/api/ai/blog and /api/ai/share-kit return the service result unchanged", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
    }));
    vi.doMock("@/lib/content/blog", () => ({ writeBlog: async () => ({ status: 201, body: { from: "blog-service" } }) }));
    vi.doMock("@/lib/content/share-kit", () => ({ writeShareKit: async () => ({ status: 202, body: { from: "kit-service" } }) }));
    vi.resetModules();
    const blog = await import("@/app/api/ai/blog/route");
    const kit = await import("@/app/api/ai/share-kit/route");
    const req = () => new Request("http://x", { method: "POST", body: JSON.stringify({ projectId: "p1" }) });
    const b = await blog.POST(req() as never);
    const k = await kit.POST(req() as never);
    expect([b.status, await b.json()]).toEqual([201, { from: "blog-service" }]);
    expect([k.status, await k.json()]).toEqual([202, { from: "kit-service" }]);
  });
});
