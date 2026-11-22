import { describe, it, expect, vi } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Parity for render status (2026-11-22). GET /api/video/status and the agent
 * tool video_status both call getRenderStatus(), so a check from an AI client
 * reads, finishes and reports a render exactly like the app's poll.
 */

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));
vi.mock("@/lib/api/heygen", () => ({
  getVideoStatus: vi.fn(), getVideoAgentSession: vi.fn(), getVideoV3Status: vi.fn(), getVideoScenes: vi.fn(),
}));
vi.mock("@/lib/video/ready-notice", () => ({ announceVideoReady: vi.fn() }));
vi.mock("@/lib/utils/webhook-publisher", () => ({ publishWebhookEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/utils/refund-credits", () => ({ refundVideoCredits: vi.fn() }));
vi.mock("@/lib/utils/store-video", () => ({ storeVideoDetailed: vi.fn() }));
vi.mock("@/lib/utils/store-options", () => ({ buildStoreOptions: vi.fn() }));

describe("getRenderStatus (shared by /api/video/status and video_status)", () => {
  it("needs a render id", async () => {
    const { getRenderStatus } = await import("@/lib/video/status");
    expect((await getRenderStatus("u1", "")).status).toBe(400);
  });

  it("only finds the caller's own videos", async () => {
    db = fakeDb({ generated_videos: null });
    const { getRenderStatus } = await import("@/lib/video/status");
    const r = await getRenderStatus("u1", "job-1");
    expect(r.status).toBe(404);
    expect(db.calls[0].filters).toContainEqual(["user_id", "u1"]);
  });

  it("reports a finished video with its link", async () => {
    db = fakeDb({ generated_videos: { id: "v1", user_id: "u1", render_status: "completed", video_url: "https://x/v.mp4", metadata: {} } });
    const { getRenderStatus } = await import("@/lib/video/status");
    const r = await getRenderStatus("u1", "job-1");
    expect(r).toMatchObject({ status: 200, body: { status: "completed", url: "https://x/v.mp4", progress: 1 } });
  });
});
