import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCta } from "@/lib/utils/default-cta";
import { standardMaxWords } from "@/lib/utils/video-length";

/**
 * How many words a short avatar script may have once this agent's own
 * closing line is counted (2026-10-24).
 *
 * The 2-minute cap (290 words) covers the script AND the closing line from
 * Settings, which is added after it. The writers were given 290 for the
 * script alone and a target that assumed a ~40-word closing line; the
 * owner's is 74, so a fresh draft came out 285 + 74 = 359 and greyed out
 * Avatar video. Now the closing line is measured and taken off first.
 */
export async function closingLineWords(
  db: SupabaseClient,
  userId: string,
  market: { city?: string | null; state?: string | null } = {},
): Promise<number> {
  const { data } = await db
    .from("profiles")
    .select("default_cta, location_city, location_state, full_name, company_name, market_years")
    .eq("id", userId)
    .maybeSingle();
  const p = data as {
    default_cta: string | null; location_city: string | null; location_state: string | null;
    full_name: string | null; company_name: string | null; market_years: string | null;
  } | null;
  if (!p) return 0;
  const line = resolveCta(p.default_cta, {
    city: market.city || p.location_city,
    state: market.state || p.location_state,
    name: p.full_name,
    company: p.company_name,
    years: p.market_years,
  });
  return line.trim() ? line.trim().split(/\s+/).length : 0;
}

/** The script's own cap and the length to aim for, with the closing line taken off. */
export function shortScriptBudget(closingWords: number): { cap: number; target: number } {
  const cap = Math.max(120, standardMaxWords() - closingWords);
  // Aim well under: the writers run long, and a script over the cap greys out Avatar video.
  return { cap, target: Math.round(cap * 0.85) };
}
