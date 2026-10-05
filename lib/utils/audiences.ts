/**
 * Audiences named by their tension, not their segment.
 *
 * "Buyers" is a category; it tells the writer nothing it did not already
 * assume. "Move-up (keeping a low rate)" is a conflict, and a conflict is what
 * makes a script argue rather than describe — the same reason the strongest
 * blog headings are questions rather than labels.
 *
 * The old segment names still resolve in AUDIENCE_SCRIPT_GUIDANCE, so projects
 * written before this keep the guidance they were generated with. Anything a
 * user names themselves is honoured too — see audienceClause.
 *
 * One list for the Create page and the Spark Tools, which each kept a copy.
 */
export const BASE_AUDIENCES = [
  "Move-up (keeping a low rate)",
  "Downsizing",
  "Relocating in",
  "First-time buyers",
  "Sellers deciding when",
  "Investors",
  "Luxury",
  "Mixed",
];

/** How many of their own a user keeps. The oldest drops off when a new one is added. */
export const MAX_CUSTOM_AUDIENCES = 12;
/** Long enough for "Nurses relocating to the Philadelphia suburbs", short enough to fit a dropdown. */
export const MAX_AUDIENCE_LENGTH = 60;

/** One audience name, tidied: single spaces, no line breaks, capped. "" when it is not a name. */
export function cleanAudienceName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_AUDIENCE_LENGTH).trim();
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A stored list, made safe to show.
 *
 * It comes from the profile or from browser storage, both of which the user
 * can write to directly, so nothing about its shape is assumed: strings only,
 * tidied, no repeats, none that are already a built-in, and no more than the cap.
 */
export function cleanAudienceList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const name = cleanAudienceName(item);
    if (!name) continue;
    if (BASE_AUDIENCES.some((b) => same(b, name)) || out.some((o) => same(o, name))) continue;
    out.push(name);
  }
  return out.slice(-MAX_CUSTOM_AUDIENCES);
}

/**
 * The name as the pickers know it.
 *
 * "downsizing" typed by hand is the built-in "Downsizing", and "first
 * responders" is the "First responders" already on the list. Returning the
 * existing spelling keeps a dropdown's value equal to one of its options.
 */
export function knownAudience(custom: string[], name: string): string | null {
  return [...BASE_AUDIENCES, ...custom].find((k) => same(k, name)) ?? null;
}

/** The custom list with `name` added, unless it is already known. */
export function withAudience(custom: string[], name: string): string[] {
  const clean = cleanAudienceName(name);
  if (!clean || knownAudience(custom, clean)) return custom;
  return [...custom, clean].slice(-MAX_CUSTOM_AUDIENCES);
}
