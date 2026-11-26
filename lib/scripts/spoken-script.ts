import type { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";
import { resolveCta } from "@/lib/utils/default-cta";
import { dropDuplicateCta, joinHookAndScript } from "@/lib/utils/script-assembly";
import { maxWords } from "@/lib/utils/video-length";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Exactly what a Spark's video will say (2026-11-25, the owner's ask: "I want
 * to see the video script going forward"). The hook, the script and the
 * closing line, chosen by the editor's own rule:
 *
 * - "No call to action" (cta_off) → no closing line.
 * - A listing keeps its own closing line (resolveInitialCta).
 * - A closing line typed in this video is kept as typed.
 * - Otherwise the one from Settings (resolveCta), as the editor opens with.
 *
 * The editor, AI apps' script approval and their renders all read this, so
 * the words approved are the words spoken. Before this, AI renders spoke the
 * script writer's own closing line, which the editor never would have.
 */

export type ClosingSource = "settings" | "custom" | "listing" | "none";

export interface SpokenScript {
  title: string;
  hook: string;
  script: string;
  closingLine: string;
  closingSource: ClosingSource;
  /** Hook, script and closing line together, as they'll be spoken. */
  spoken: string;
  words: number;
  seconds: number;
  /** Tied to these exact words: any change gives a new version. */
  version: string;
  /** What the render will do to the words, said plainly. */
  notes: string[];
}

interface ProjectRow {
  title: string | null;
  project_type: string | null;
  location_city: string | null;
  location_state: string | null;
  ai_script: Record<string, unknown> | null;
}
interface ProfileRow {
  full_name: string | null;
  company_name: string | null;
  location_city: string | null;
  location_state: string | null;
  default_cta: string | null;
  market_years: string | null;
  subscription_tier?: string | null;
}

const WPM = 145;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The closing line by the editor's rule (see above). Pure, for tests. */
export function closingLineFor(p: ProjectRow, prof: ProfileRow | null): { line: string; source: ClosingSource } {
  const ai = p.ai_script ?? {};
  if (ai.cta_off === true) return { line: "", source: "none" };
  if (p.project_type === "listing_video") return { line: s(ai.cta), source: s(ai.cta) ? "listing" : "none" };
  if (ai.user_edited === true && ai.cta_edited !== false) return { line: s(ai.cta), source: s(ai.cta) ? "custom" : "none" };
  const fromSettings = prof ? resolveCta(prof.default_cta, {
    city: p.location_city || prof.location_city,
    state: p.location_state || prof.location_state,
    name: prof.full_name,
    company: prof.company_name,
    years: prof.market_years,
  }) : "";
  if (fromSettings) return { line: fromSettings, source: "settings" };
  return { line: s(ai.cta), source: s(ai.cta) ? "custom" : "none" };
}

/** The version id for a script: the first 12 of its hash. */
export const scriptVersion = (hook: string, script: string, closingLine: string) =>
  createHash("sha256").update(JSON.stringify([hook.trim(), script.trim(), closingLine.trim()])).digest("hex").slice(0, 12);

/** The whole spoken script from a project and profile. Pure, for tests. */
export function spokenFrom(p: ProjectRow, prof: ProfileRow | null): SpokenScript {
  const ai = p.ai_script ?? {};
  const hook = s(ai.hook);
  const script = s(ai.script);
  const { line, source } = closingLineFor(p, prof);
  const body = joinHookAndScript(hook, dropDuplicateCta(line, script));
  const spoken = [body, line].filter(Boolean).join("\n\n");
  const words = spoken.split(/\s+/).filter(Boolean).length;
  const notes: string[] = [];
  const raw = [hook, script].filter(Boolean).join("\n\n");
  if (body.replace(/\s+/g, " ") !== raw.replace(/\s+/g, " ")) {
    notes.push("A sentence that repeats the opening or the closing line is said only once.");
  }
  const cap = maxWords("standard", prof?.subscription_tier ?? null);
  if (words > cap) {
    notes.push(`It's ${words} words, over the ${cap}-word limit for a video of about 2 minutes, so the end would be cut. Shorten it before approving.`);
  }
  return {
    title: s(p.title) || s(ai.title),
    hook, script, closingLine: line, closingSource: source, spoken,
    words, seconds: Math.round((words / WPM) * 60),
    version: scriptVersion(hook, script, line),
    notes,
  };
}

/** The spoken script of one of this user's Sparks, or null when it isn't theirs. */
export async function spokenScriptFor(admin: Admin, userId: string, projectId: string): Promise<SpokenScript | null> {
  const [{ data: proj }, { data: prof }] = await Promise.all([
    admin.from("projects").select("title, project_type, location_city, location_state, ai_script").eq("id", projectId).eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("full_name, company_name, location_city, location_state, default_cta, market_years, subscription_tier").eq("id", userId).maybeSingle(),
  ]);
  if (!proj) return null;
  return spokenFrom(proj as ProjectRow, (prof as ProfileRow | null) ?? null);
}

/** What an AI app shows the user, labeled, every word. */
export function scriptForReview(sp: SpokenScript) {
  return {
    title: sp.title,
    hook: sp.hook,
    script: sp.script,
    closingLine: sp.closingLine || "(none)",
    closingLineFrom: sp.closingSource === "settings" ? "Settings" : sp.closingSource === "none" ? "none" : sp.closingSource === "listing" ? "this listing" : "typed for this video",
    words: sp.words,
    aboutSeconds: sp.seconds,
    version: sp.version,
    ...(sp.notes.length && { notes: sp.notes }),
  };
}
