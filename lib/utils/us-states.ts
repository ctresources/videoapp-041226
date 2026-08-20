/**
 * US state name → postal abbreviation.
 *
 * Lived inside app/(dashboard)/create/page.tsx until the voice brief needed the
 * same mapping; a second copy would have been the third length-constant lesson
 * in a week.
 */
const STATE_MAP: Record<string, string> = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS",
  "kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD","massachusetts":"MA",
  "michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO","montana":"MT",
  "nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",
  "ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA","rhode island":"RI",
  "south carolina":"SC","south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT",
  "vermont":"VT","virginia":"VA","washington":"WA","west virginia":"WV",
  "wisconsin":"WI","wyoming":"WY","district of columbia":"DC",
};

const ABBREVIATIONS = new Set(Object.values(STATE_MAP));

/**
 * Lenient — for a field someone is typing into, where "P" on the way to "PA"
 * must not be rejected. Falls back to the first two characters.
 */
export function toStateAbbr(t: string): string {
  const lower = t.trim().toLowerCase();
  return STATE_MAP[lower] || t.trim().slice(0, 2).toUpperCase();
}

/**
 * Strict — for values arriving from a model, where a wrong answer is worse than
 * no answer. Returns null unless the input is a real abbreviation or a full
 * state name.
 *
 * The lenient version truncates, and truncation is silently wrong here:
 * "Pennsylvania".slice(0, 2) is "PE", which is Prince Edward Island. It passed
 * a /^[A-Za-z]{2}$/ check and would have produced a script about the wrong
 * place entirely.
 */
export function parseStateAbbr(t: string): string | null {
  const trimmed = t.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && ABBREVIATIONS.has(upper)) return upper;
  return STATE_MAP[trimmed.toLowerCase()] ?? null;
}
