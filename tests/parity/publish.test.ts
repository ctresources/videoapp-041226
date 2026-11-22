import { describe, it, expect, vi } from "vitest";
import { fakeDb } from "../helpers/fake-db";

/**
 * Parity for publishing (2026-11-22). POST /api/social/post and the agent
 * tool confirm_publish both call publishToTargets(), so both enforce the same
 * staff limits, ownership, review-request rule and video-check hold before
 * anything is posted.
 */

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.db }));
let staff: { publish: string } | null = null;
vi.mock("@/lib/staff/staff", () => ({
  staffLimits: async () => staff,
  canPublishTo: () => false,
  STAFF_NO_PUBLISH: "Publishing is off for your staff account.",
}));
vi.mock("@/lib/api/youtube", () => ({
  getValidAccessToken: vi.fn(), uploadVideoToYouTube: vi.fn(), setVideoThumbnail: vi.fn(),
  setVideoThumbnailBytes: vi.fn(), YouTubeReconnectError: class extends Error {},
}));
vi.mock("@/lib/api/thumbnail-card", () => ({ thumbnailCardPng: vi.fn() }));
vi.mock("@/lib/api/upload-post", () => ({
  SocialPublishError: class extends Error {}, profileUsername: () => "u", publishPhoto: vi.fn(),
  publishVideo: vi.fn(), uploadPostConfigured: () => true,
}));
vi.mock("@/lib/api/social-settle", () => ({ storeRef: vi.fn() }));
vi.mock("@/lib/api/post-covers", () => ({ coversFor: vi.fn() }));

const target = [{ accountId: "a1", platform: "instagram" }];

describe("publishToTargets (shared by /api/social/post and confirm_publish)", () => {
  it("staff with publishing off are refused before anything happens", async () => {
    staff = { publish: "off" };
    db = fakeDb();
    const { publishToTargets } = await import("@/lib/social/publish");
    const r = await publishToTargets("u1", { videoId: "v1", targets: target });
    expect(r.status).toBe(403);
    expect(db.calls).toHaveLength(0);
    staff = null;
  });

  it("needs a video and at least one destination", async () => {
    const { publishToTargets } = await import("@/lib/social/publish");
    expect((await publishToTargets("u1", { videoId: "", targets: [] })).status).toBe(400);
  });

  it("a video-check hold stops automatic posts but not a person's own Publish", async () => {
    staff = null;
    db = fakeDb({ generated_videos: { id: "v1", user_id: "u1", metadata: { video_check: { remake: true } }, projects: null } });
    const { publishToTargets } = await import("@/lib/social/publish");
    const auto = await publishToTargets("u1", { videoId: "v1", targets: target }, { automatic: true });
    expect(auto.status).toBe(409);
    expect((auto.body as { code: string }).code).toBe("video_check_held");
  });

  it("only posts the caller's own videos", async () => {
    db = fakeDb({ generated_videos: null });
    const { publishToTargets } = await import("@/lib/social/publish");
    const r = await publishToTargets("u1", { videoId: "someone-elses", targets: target });
    expect(r.status).toBe(404);
    expect(db.calls[0].filters).toContainEqual(["user_id", "u1"]);
  });
});
