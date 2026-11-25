import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/accounts/links", () => ({ areLinked: vi.fn(async (_a: unknown, x: string, y: string) => x === "owner" && y === "linked") }));

describe("linked accounts (2026-11-25)", () => {
  it("signing in can come back to the link page, and nowhere else new", async () => {
    const { consentReturnPath } = await import("@/lib/utils/safe-next");
    expect(consentReturnPath("/link-account?code=abc_DEF-123")).toBe("/link-account?code=abc_DEF-123");
    expect(consentReturnPath("/oauth/consent?authorization_id=x")).toBe("/oauth/consent?authorization_id=x");
    expect(consentReturnPath("/link-accounts")).toBeNull();
    expect(consentReturnPath("https://evil.example/link-account?code=x")).toBeNull();
  });

  it("acts on a linked account it switched to, and undoes a switch that's no longer linked", async () => {
    const { activeAccount } = await import("@/lib/agent/auth/active-account");
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({})) }));
    const admin = { from: vi.fn(() => ({ update })) } as never;
    expect(await activeAccount(admin, "c1", "owner", null)).toBe("owner");
    expect(await activeAccount(admin, "c1", "owner", "linked")).toBe("linked");
    expect(update).not.toHaveBeenCalled();
    expect(await activeAccount(admin, "c1", "owner", "stranger")).toBe("owner");
    expect(update).toHaveBeenCalledWith({ active_user_id: null });
  });
});
