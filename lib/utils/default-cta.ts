/**
 * Default channel-growth CTA spoken at the end of videos (avatar, Digital
 * Twin, and teleprompter recordings). Placeholders resolve per video:
 * {city}/{state} use the project's subject market first, then the user's
 * home market from Settings — so a video about Blue Bell, PA says Blue Bell
 * even when the agent is based elsewhere.
 */
export const DEFAULT_CTA_TEMPLATE = `If this is your first time on the channel and you want to know everything about living in {city}, {state} and the surrounding suburbs, subscribe so you can be the first to know about the current market in {city}.

My name is {name} and I've been guiding buyers and sellers across the {city} area for {years} years.

{i_or_team} love helping people make their move to {city}, {state} — whether that's 9 days or 90 days away, feel free to reach out.

All of our contact info is in the description, and we'd be happy to help you make a smooth move to {city}.`;

export interface CtaVars {
  city?: string | null;
  state?: string | null;
  name?: string | null;
  company?: string | null;
  years?: string | null;
}

/**
 * Fills a CTA template's placeholders. Pass the user's stored template (or
 * null/empty to use the built-in default). Empty years drops the
 * "for {years} years" phrase; a missing state collapses "{city}, {state}"
 * to just the city.
 */
export function resolveCta(template: string | null | undefined, vars: CtaVars): string {
  let out = template?.trim() ? template : DEFAULT_CTA_TEMPLATE;

  const city = vars.city?.trim() || "your area";
  const state = vars.state?.trim() || "";

  out = out.replace(/\{city\},\s*\{state\}/g, state ? `${city}, ${state}` : city);
  out = out.replace(/\{city\}/g, city);
  out = out.replace(/\{state\}/g, state);

  const years = vars.years?.trim() || "";
  if (years) {
    out = out.replace(/\{years\}/g, years);
  } else {
    out = out.replace(/\s*for \{years\} years/g, "");
    out = out.replace(/\{years\}/g, "");
  }

  out = out.replace(/\{i_or_team\}/g, vars.company?.trim() ? "My team and I" : "I");
  out = out.replace(/\{name\}/g, vars.name?.trim() || "");

  // Tidy any double spaces left by empty placeholders
  return out.replace(/ {2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}
