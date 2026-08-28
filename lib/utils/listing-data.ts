import type { ListingData } from "@/app/api/ai/scrape-listing/route";

/**
 * Force model output into the shape ListingData promises.
 *
 * Both importers ended their parse with `JSON.parse(text) as ListingData`,
 * which is an assertion, not a check — the model is free to answer null for
 * any field and the type said otherwise. It stayed hidden while listings
 * parsed well: address and price were always strings in practice.
 *
 * Then a scrape came back with every fact null, the form called
 * `listing.price.trim()`, and the page died with a client-side exception on
 * a request the server had reported as 200.
 *
 * The prompt is right to prefer null over a guess — "null is ALWAYS better
 * than a wrong number" is the rule that keeps invented square footage out of
 * a published video. This is the other half of that bargain: null is allowed
 * to arrive, so it has to land somewhere the UI can hold. Strings become "",
 * which reads as an empty field to fill in; numbers stay null, which is what
 * the number inputs already expect.
 */
export function coerceListing(raw: unknown): ListingData {
  const o = (raw ?? {}) as Record<string, unknown>;

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    // Models return "3" and "1,250" as often as 3 and 1250.
    if (typeof v === "string") {
      const n = Number(v.replace(/[^0-9.]/g, ""));
      if (v.trim() && Number.isFinite(n)) return n;
    }
    return null;
  };
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];

  return {
    address: str(o.address),
    price: str(o.price),
    beds: num(o.beds),
    baths: num(o.baths),
    sqft: num(o.sqft),
    yearBuilt: num(o.yearBuilt),
    propertyType: str(o.propertyType) || "Single Family",
    description: str(o.description),
    features: strList(o.features),
    photoUrls: strList(o.photoUrls),
    agentName: str(o.agentName),
    mlsId: str(o.mlsId),
    daysOnMarket: num(o.daysOnMarket),
    garage: str(o.garage),
    lotSize: str(o.lotSize),
    neighborhood: str(o.neighborhood),
  };
}
