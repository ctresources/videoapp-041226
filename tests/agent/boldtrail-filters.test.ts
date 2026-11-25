import { describe, expect, it } from "vitest";
import { cleanFilter, contactTag, hasFilter, matchesFilter, statusLabel, typeLabel } from "@/lib/boldtrail/filters";

describe("BoldTrail filters (2026-11-25)", () => {
  it("reads status codes and words", () => {
    expect(statusLabel(2)).toBe("Closed");
    expect(statusLabel("2")).toBe("Closed");
    expect(statusLabel("closed")).toBe("Closed");
    expect(statusLabel("contract")).toBe("Under contract");
    expect(statusLabel(6)).toBeNull();
    expect(statusLabel(null)).toBeNull();
  });

  it("keeps only known filter values", () => {
    expect(cleanFilter({ status: "2", type: "Seller" })).toEqual({ status: 2, type: "seller" });
    expect(cleanFilter({ status: "", type: "" })).toEqual({ status: null, type: null });
    expect(cleanFilter({ status: "9", type: "landlord" })).toEqual({ status: null, type: null });
    expect(hasFilter({ status: 0, type: null })).toBe(true);
    expect(hasFilter({ status: null, type: null })).toBe(false);
  });

  it("drops a contact BoldTrail returned that doesn't match the filter", () => {
    const f = { status: 2, type: "seller" };
    expect(matchesFilter({ status: 2, deal_type: "seller" }, f)).toBe(true);
    expect(matchesFilter({ status: "Closed", deal_type: "Buyer/Seller" }, f)).toBe(true);
    expect(matchesFilter({ status: 3, deal_type: "seller" }, f)).toBe(false);
    expect(matchesFilter({ status: 2, deal_type: "buyer" }, f)).toBe(false);
  });

  it("takes BoldTrail's word when a row doesn't say", () => {
    expect(matchesFilter({}, { status: 2, type: "seller" })).toBe(true);
  });

  it("labels for the list", () => {
    expect(typeLabel("seller")).toBe("Seller");
    expect(typeLabel("x")).toBeNull();
    expect(contactTag({ status: "Closed", type: "Seller" })).toBe("Closed · Seller");
    expect(contactTag({})).toBe("");
  });
});
