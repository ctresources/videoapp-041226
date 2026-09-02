import { parseStateAbbr } from "@/lib/utils/us-states";

/**
 * Pull the city and state out of an address or a market string.
 *
 * Lived inside app/api/ai/listing-video/route.ts until create-blog needed the
 * same parse and did it by hand instead — splitting on the first comma, which
 * for a listing address made the STREET the city and the CITY the state, and
 * dropped the state entirely. That string is handed to HeyGen four times as
 * the place to source establishing shots for, so a whole render's b-roll came
 * back from nowhere in particular.
 *
 * Handles "123 Oak Road, Willow Grove, PA 19090", "…, Willow Grove, PA" and
 * "Willow Grove, PA". Returns nothing rather than guessing when there is no
 * recognisable trailing state, so the caller can fall back deliberately.
 */
export function parseCityState(address: string): { city?: string; state?: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  // The last segment is "PA", "PA 19438", "Pennsylvania" or "Pennsylvania
  // 19422" — drop any trailing ZIP before asking what the rest of it is.
  const tail = parts[parts.length - 1].replace(/\s+\d{5}(?:-\d{4})?$/, "").trim();

  // parseStateAbbr, not a two-letter regex. The regex missed spelled-out
  // states, and the fallback below then took the state itself as the city:
  // "Blue Bell, Pennsylvania" came out as the city "Pennsylvania". It is also
  // strict about what it accepts, which matters here — its lenient sibling
  // truncates, and "Pennsylvania".slice(0, 2) is "PE", Prince Edward Island.
  const state = parseStateAbbr(tail);
  if (state) return { city: parts[parts.length - 2], state };

  // No trailing state — the last segment is the best city candidate.
  return { city: tail };
}

/**
 * The same, for a script's `location` field, which is one of two shapes: a
 * listing's full street address, or a market the user typed ("Harleysville",
 * "Harleysville, PA").
 *
 * A bare town name has no comma, so parseCityState declines it — correctly,
 * since it is built for addresses and "24 Shagbark Ct E" would otherwise
 * become a city. Digits are what tell the two apart: towns do not have street
 * numbers in them.
 */
export function parseScriptLocation(raw: string | null | undefined): { city: string; state: string } {
  const text = (raw ?? "").trim();
  if (!text) return { city: "", state: "" };

  const parsed = parseCityState(text);
  if (parsed.city) return { city: parsed.city, state: parsed.state ?? "" };

  if (!text.includes(",") && !/\d/.test(text)) return { city: text, state: "" };
  return { city: "", state: "" };
}
