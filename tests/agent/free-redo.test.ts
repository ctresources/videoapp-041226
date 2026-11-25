import { describe, expect, it } from "vitest";
import { redoIsFree, REDO_CREDIT_SOURCE, type RedoRow } from "@/lib/utils/free-redo";

const NOW = Date.parse("2026-11-25T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const row = (o: Partial<RedoRow>): RedoRow => ({
  render_status: "completed",
  render_finished_at: hoursAgo(1),
  created_at: hoursAgo(1.2),
  source_video_id: null,
  credit_source: "plan",
  ...o,
});

describe("redoIsFree", () => {
  it("is free after a charged video finished within 48 hours (Abby's case)", () => {
    expect(redoIsFree([row({})], NOW)).toBe(true);
  });

  it("is not free with no finished video yet", () => {
    expect(redoIsFree([], NOW)).toBe(false);
    expect(redoIsFree([row({ render_status: "rendering", render_finished_at: null })], NOW)).toBe(false);
  });

  it("is not free after 48 hours", () => {
    expect(redoIsFree([row({ render_finished_at: hoursAgo(49) })], NOW)).toBe(false);
  });

  it("counts from the first video, not the latest", () => {
    expect(redoIsFree([row({ render_finished_at: hoursAgo(50) }), row({ render_finished_at: hoursAgo(2) })], NOW)).toBe(false);
  });

  it("is used up once a redo exists, even one still being made", () => {
    expect(redoIsFree([row({}), row({ credit_source: REDO_CREDIT_SOURCE })], NOW)).toBe(false);
    expect(redoIsFree([row({}), row({ credit_source: REDO_CREDIT_SOURCE, render_status: "rendering" })], NOW)).toBe(false);
  });

  it("gives the redo back when the redo failed", () => {
    expect(redoIsFree([row({}), row({ credit_source: REDO_CREDIT_SOURCE, render_status: "failed" })], NOW)).toBe(true);
  });

  it("ignores camera takes, classic reels, failed videos and translations", () => {
    expect(redoIsFree([row({ credit_source: null })], NOW)).toBe(false);
    expect(redoIsFree([row({ render_status: "failed" })], NOW)).toBe(false);
    expect(redoIsFree([row({ source_video_id: "abc" })], NOW)).toBe(false);
  });
});
