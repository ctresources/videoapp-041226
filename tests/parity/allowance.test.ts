import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Parity: GET /api/profile/allowance is a thin door onto the shared
 * getAllowance service (lib/usage/allowance.ts). The agent layer's
 * get_account calls the same service, so the app and AI clients can never
 * disagree about videos left, plan or access.
 */

const fakeUser = { id: "user-1" };
const fakeClient = { auth: { getUser: vi.fn(async () => ({ data: { user: fakeUser } })) } };

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => fakeClient) }));
const getAllowance = vi.fn(async () => ({ tier: "agent", shortPerMonth: 7, shortPlanLeft: 3 }));
vi.mock("@/lib/usage/allowance", () => ({ getAllowance }));

describe("allowance route → shared service", () => {
  beforeEach(() => getAllowance.mockClear());

  it("returns exactly what the shared service returns", async () => {
    const { GET } = await import("@/app/api/profile/allowance/route");
    const res = await GET();
    expect(await res.json()).toEqual({ tier: "agent", shortPerMonth: 7, shortPlanLeft: 3 });
    expect(getAllowance).toHaveBeenCalledWith(fakeClient, "user-1", { touchLastActive: true });
  });

  it("refuses without a signed-in user and never reads the allowance", async () => {
    fakeClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } } as never);
    const { GET } = await import("@/app/api/profile/allowance/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getAllowance).not.toHaveBeenCalled();
  });
});

describe("plan video counts", () => {
  it("match the plans: Creator 4, Producer 4, old Influencer 10", async () => {
    const { videosPerMonth } = await import("@/lib/plan-limits");
    expect(videosPerMonth("starter")).toBe(4);
    expect(videosPerMonth("agent")).toBe(4);
    expect(videosPerMonth("pro")).toBe(10);
    expect(videosPerMonth("free")).toBe(0);
    expect(videosPerMonth(null)).toBe(0);
  });

  it("a Producer from before the change keeps their 7; it applies to no other plan", async () => {
    const { videosPerMonth } = await import("@/lib/plan-limits");
    expect(videosPerMonth("agent", 7)).toBe(7);
    expect(videosPerMonth("starter", 7)).toBe(4);
    expect(videosPerMonth("free", 7)).toBe(0);
  });

  it("only Producer (and the old Influencer) get unlimited circle", async () => {
    const { hasUnlimitedCircle } = await import("@/lib/plan-limits");
    expect(hasUnlimitedCircle("agent")).toBe(true);
    expect(hasUnlimitedCircle("pro")).toBe(true);
    expect(hasUnlimitedCircle("starter")).toBe(false);
    expect(hasUnlimitedCircle("free")).toBe(false);
    expect(hasUnlimitedCircle(null)).toBe(false);
  });
});
