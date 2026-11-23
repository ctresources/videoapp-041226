import { describe, it, expect, vi } from "vitest";
import { circleFreeToday } from "@/lib/usage/circle";

/** One free AI Avatar in Circle video a day, on Producer (2026-11-23). */
function db(count: number) {
  const filters: [string, unknown][] = [];
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (c: string, v: unknown) => { filters.push([c, v]); return b; };
  b.neq = (c: string, v: unknown) => { filters.push([`not ${c}`, v]); return b; };
  b.gte = (c: string, v: unknown) => { filters.push([`from ${c}`, v]); return b; };
  b.then = (r: (v: unknown) => unknown) => Promise.resolve({ count }).then(r);
  return { client: { from: vi.fn(() => b) }, filters };
}

describe("circleFreeToday", () => {
  it("Producer's first of the day is free", async () => {
    expect(await circleFreeToday(db(0).client, "u1", "agent", "America/New_York")).toBe(true);
  });
  it("the second that day isn't", async () => {
    expect(await circleFreeToday(db(1).client, "u1", "agent", "America/New_York")).toBe(false);
  });
  it("Creator and free accounts never get one, and nothing is even counted", async () => {
    const d = db(0);
    expect(await circleFreeToday(d.client, "u1", "starter", null)).toBe(false);
    expect(await circleFreeToday(d.client, "u1", "free", null)).toBe(false);
    expect(d.client.from).not.toHaveBeenCalled();
  });
  it("counts only this user's free circle videos that didn't fail", async () => {
    const d = db(0);
    await circleFreeToday(d.client, "u1", "agent", null);
    expect(d.filters).toContainEqual(["user_id", "u1"]);
    expect(d.filters).toContainEqual(["metadata->>credit_source", "circle_unlimited"]);
    expect(d.filters).toContainEqual(["not render_status", "failed"]);
  });
  it("the day starts at midnight in the agent's own time zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T03:00:00Z")); // 10 pm Nov 22 in New York
    const d = db(0);
    await circleFreeToday(d.client, "u1", "agent", "America/New_York");
    vi.useRealTimers();
    const from = d.filters.find(([c]) => c === "from created_at")?.[1];
    expect(from).toBe("2026-11-22T05:00:00.000Z");
  });
});
