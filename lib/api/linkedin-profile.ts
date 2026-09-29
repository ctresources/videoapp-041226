import { perplexityChat } from "@/lib/api/perplexity";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { PLAIN_COPY_RULES, plainCopy, plainCopyAll } from "@/lib/utils/copy-style";
import { briefBlock } from "@/lib/api/brief-context";
import {
  LINKEDIN_LIMITS as L, LINKEDIN_SPECIALTIES_MAX, fitToLimit, toLinkedInSlug,
} from "@/lib/utils/linkedin-limits";

/**
 * LinkedIn Profile: a one-time setup tool, like the Channel Name Generator.
 *
 * Writes every paste-in field of an agent's personal profile (headline, About,
 * current position, top skills, custom URL) plus the post announcing their
 * video channel, and optionally a Company Page for a team or brokerage.
 *
 * The facts come only from what the agent typed. A search-backed model asked
 * to write about "Sarah Johnson, Charlotte" will otherwise find a different
 * Sarah Johnson and credit her awards to this one.
 */

export interface LinkedInInput {
  name: string;
  brokerage?: string;
  city?: string;
  state?: string;
  niche?: string;
  years?: string;
  designations?: string;
  story?: string;
  audience?: string;
  tone?: string;
  youtubeUrl?: string;
  website?: string;
  company?: boolean;
  /** The team the Company Page is for. Never the brokerage: an agent at Compass does not run Compass. */
  teamName?: string;
}

export interface LinkedInProfile {
  headlines: string[];
  about: string;
  position: { title: string; description: string };
  skills: string[];
  customUrls: string[];
  post: string;
  company: { tagline: string; about: string; specialties: string[] } | null;
}

interface Draft {
  headlines?: string[];
  about?: string;
  position?: { title?: string; description?: string };
  skills?: string[];
  customUrls?: string[];
  post?: string;
  company?: { tagline?: string; about?: string; specialties?: string[] } | null;
}

function parseJson<T>(raw: string): T {
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

/** Every text field that has a limit, as [path, value, max]. */
function measured(d: Draft): [string, string, number][] {
  const out: [string, string, number][] = [];
  (d.headlines ?? []).forEach((h, i) => out.push([`headlines.${i}`, h, L.headline]));
  if (d.about) out.push(["about", d.about, L.about]);
  if (d.position?.title) out.push(["position.title", d.position.title, L.positionTitle]);
  if (d.position?.description) out.push(["position.description", d.position.description, L.positionDescription]);
  if (d.post) out.push(["post", d.post, L.post]);
  if (d.company?.tagline) out.push(["company.tagline", d.company.tagline, L.companyTagline]);
  if (d.company?.about) out.push(["company.about", d.company.about, L.companyAbout]);
  return out;
}

function setPath(d: Draft, path: string, value: string) {
  const [head, tail] = path.split(".");
  if (head === "headlines" && d.headlines) d.headlines[Number(tail)] = value;
  else if (head === "about") d.about = value;
  else if (head === "post") d.post = value;
  else if (head === "position" && d.position) (d.position as Record<string, string>)[tail] = value;
  else if (head === "company" && d.company) (d.company as Record<string, string>)[tail] = value;
}

function prompts(input: LinkedInInput): { system: string; prompt: string } {
  const location = [input.city, input.state].map((s) => s?.trim()).filter(Boolean).join(", ");
  const facts = [
    `Name: ${input.name.trim()}`,
    input.brokerage?.trim() && `Brokerage or team: ${input.brokerage.trim()}`,
    location && `Market: ${location}`,
    input.niche?.trim() && `Specialty: ${input.niche.trim()}`,
    input.years?.trim() && `Years in real estate: ${input.years.trim()}`,
    input.designations?.trim() && `Designations: ${input.designations.trim()}`,
    input.audience?.trim() && `Who they mostly help: ${input.audience.trim()}`,
    input.youtubeUrl?.trim() && `YouTube channel: ${input.youtubeUrl.trim()}`,
    input.website?.trim() && `Website: ${input.website.trim()}`,
    input.story?.trim() && `In their own words:\n"""\n${input.story.trim().slice(0, 3000)}\n"""`,
  ].filter(Boolean).join("\n");

  const team = input.teamName?.trim() || `${input.name.trim()}'s team`;
  const brokerageNote = input.brokerage?.trim()
    ? ` The team works under ${input.brokerage.trim()}. The page is for the team, never for ${input.brokerage.trim()} itself: do not write as if the team were the brokerage or spoke for it.`
    : "";
  const companyAsk = input.company
    ? `,
  "company": {
    "for": "This Company Page is for their team, named \"${team}\".${brokerageNote}",
    "tagline": "Company Page tagline for ${team}, under ${L.companyTagline} characters",
    "about": "Company Page About, 600 to 1,200 characters, never over ${L.companyAbout}. What the team does, where, and for whom, then how to reach them",
    "specialties": ["8 to 12 specialties, 1 to 4 words each"]
  }`
    : "";

  const system = `You write LinkedIn profiles for real estate agents. Return only valid JSON.

FACTS RULE: Use only the facts the agent gives you. Do not search for this person or add anything about them from anywhere else: no sales volume, awards, rankings, reviews, years, designations, or client counts they did not state. Where a fact is missing, write around it rather than inventing one.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

  const prompt = `Write the LinkedIn profile fields for this agent.

${facts}${briefBlock({ tone: input.tone })}

LinkedIn is where relocation referrals, investors, other agents and past clients look an agent up. Write for that reader: credible, specific, human, and in the first person where LinkedIn expects it (About, position description, post). Use contractions the way people speak (I'm, I'll, you're). Where a field is in the third person (the Company Page), refer to the agent by name, never as he, she, him or her, unless their own words use a pronoun for themselves. Do not repeat the same list of client types (buyers, sellers, investors...) in every field; each field should earn its place with something the others do not say.

Return ONLY this JSON:
{
  "headlines": ["3 different headline options, each under ${L.headline} characters. Say who they help and where, not only a job title. Separating parts with ' | ' is fine"],
  "about": "About section, 1,200 to 1,800 characters, never over ${L.about}. First person. Open with what they do for people, not a greeting. Short paragraphs. If they have a YouTube channel, one line inviting people to watch it. End with how to reach them",
  "position": {
    "title": "Current job title, under ${L.positionTitle} characters, e.g. 'REALTOR®' or 'Real Estate Agent and Team Lead'",
    "description": "Description for their current position, 400 to 900 characters, never over ${L.positionDescription}. First person. What they do day to day and for whom"
  },
  "skills": ["exactly 5 LinkedIn skills, 1 to 4 words each, the ones a client or referral partner would search"],
  "customUrls": ["3 custom URL suggestions for linkedin.com/in/, lowercase letters, digits and hyphens only, built from their name and market"],
  "post": "A LinkedIn post announcing their video channel, 120 to 200 words, first person. What they will cover and why it helps the reader. End with one question to invite comments.${input.youtubeUrl?.trim() ? " Include the channel link on its own line near the end." : " They have no channel link yet, so do not invent one; say they will share their first video soon."} At most 3 hashtags, on the last line"${companyAsk}
}`;

  return { system, prompt };
}

/**
 * Draft, then one rewrite of any field over its LinkedIn limit, then a cut at
 * a sentence for anything still over. Returns null when the draft itself is
 * unusable; the shorten pass failing only falls through to the cut.
 */
export async function writeLinkedInProfile(input: LinkedInInput): Promise<LinkedInProfile | null> {
  const { system, prompt } = prompts(input);

  let draft: Draft;
  try {
    draft = parseJson<Draft>(await perplexityChat([
      { role: "system", content: system },
      { role: "user", content: prompt },
    ]));
  } catch (e) {
    console.error("[linkedin-profile] draft failed:", e instanceof Error ? e.message : e);
    return null;
  }
  if (!draft.about || !draft.headlines?.length) return null;

  // House style first: stripping emoji and dashes can only shorten a field,
  // so measuring after it never asks for a rewrite that was not needed.
  draft.headlines = plainCopyAll(draft.headlines).slice(0, 3);
  draft.about = plainCopy(draft.about);
  draft.post = plainCopy(draft.post ?? "");
  if (draft.position) {
    draft.position.title = plainCopy(draft.position.title ?? "");
    draft.position.description = plainCopy(draft.position.description ?? "");
  }
  if (draft.company) {
    draft.company.tagline = plainCopy(draft.company.tagline ?? "");
    draft.company.about = plainCopy(draft.company.about ?? "");
  }

  // One rewrite for anything over its limit. One pass, not a loop: whatever
  // is still long afterwards is cut at a sentence below.
  const over = measured(draft).filter(([, v, max]) => v.length > max);
  if (over.length) {
    try {
      const fixes = parseJson<Record<string, string>>(await perplexityChat([
        { role: "system", content: `You shorten LinkedIn profile text. Keep the meaning, the facts and the voice. Add nothing new. Return only valid JSON.\n\n${PLAIN_COPY_RULES}` },
        {
          role: "user",
          content: `Each field below is over its character limit. Rewrite each one to fit, with room to spare.

${over.map(([path, v, max]) => `"${path}" is ${v.length} characters, limit ${max}:\n"""\n${v}\n"""`).join("\n\n")}

Return ONLY a JSON object with exactly these keys: ${over.map(([p]) => `"${p}"`).join(", ")}`,
        },
      ]));
      for (const [path] of over) {
        const fixed = typeof fixes[path] === "string" ? plainCopy(fixes[path]) : "";
        if (fixed) setPath(draft, path, fixed);
      }
    } catch (e) {
      console.error("[linkedin-profile] shorten pass failed:", e instanceof Error ? e.message : e);
    }
  }
  for (const [path, value, max] of measured(draft)) {
    if (value.length > max) setPath(draft, path, fitToLimit(value, max));
  }

  return {
    headlines: draft.headlines,
    about: draft.about,
    position: {
      title: draft.position?.title ?? "",
      description: draft.position?.description ?? "",
    },
    skills: plainCopyAll(draft.skills).map((s) => fitToLimit(s, L.skill)).slice(0, 5),
    customUrls: Array.from(new Set((draft.customUrls ?? []).map(toLinkedInSlug).filter((s) => s.length >= 3))).slice(0, 3),
    post: draft.post,
    company: input.company && draft.company
      ? {
          tagline: draft.company.tagline ?? "",
          about: draft.company.about ?? "",
          specialties: plainCopyAll(draft.company.specialties)
            .map((s) => fitToLimit(s, L.specialty))
            .slice(0, LINKEDIN_SPECIALTIES_MAX),
        }
      : null,
  };
}
