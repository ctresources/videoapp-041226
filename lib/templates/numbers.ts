import { perplexityChat } from "@/lib/api/perplexity";

/**
 * "Look up numbers" on the Market Update template (2026-11-03): the latest
 * median price, days on market and homes sold for an area, from a published
 * source found by web search. A figure the source doesn't state stays blank;
 * the source is shown under the boxes so the agent checks it before making
 * the video (these numbers go out under their name).
 */
export interface MarketNumbers {
  s1: string; s1c: string; s2: string; s2c: string; s3: string; s3c: string;
  /** e.g. "September 2026". */
  period: string;
  source: string; sourceUrl: string;
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function lookUpMarketNumbers(area: string): Promise<MarketNumbers | null> {
  const where = area.trim().slice(0, 120);
  if (!where) return null;
  const raw = await perplexityChat([
    { role: "system", content: "You look up published real estate market figures. You only report a figure you found stated in a published source for exactly that area. Never estimate, average, or fill a gap. Return only valid JSON." },
    {
      role: "user",
      content: `Find the most recent published monthly residential real estate figures for: ${where}.

Wanted (all from ONE source and ONE month if possible):
- s1: median sold price (e.g. "$412K" or "$412,000")
- s2: median days on market (just the number, e.g. "18")
- s3: number of homes sold that month (just the number, e.g. "126")
- s1c, s2c, s3c: the change for each vs the same month last year, written like "Up 4%", "Down 3 days", "Up 9%"; blank if the source doesn't say.

RULES:
- Every figure must be stated in the source. If one isn't, leave it "".
- Values at most 14 characters.
- "period" is the month and year the figures cover, like "September 2026".
- "source" is the publisher's name (e.g. "Redfin", "Bright MLS"), "sourceUrl" the page.

Return ONLY this JSON: {"period":"","source":"","sourceUrl":"","s1":"","s1c":"","s2":"","s2c":"","s3":"","s3c":""}`,
    },
  ], "sonar");
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a !== -1 && b !== -1) text = text.slice(a, b + 1);
  const j = JSON.parse(text) as Record<string, unknown>;
  const url = clip(j.sourceUrl, 300);
  const out: MarketNumbers = {
    s1: clip(j.s1, 14), s1c: clip(j.s1c, 14), s2: clip(j.s2, 14), s2c: clip(j.s2c, 14), s3: clip(j.s3, 14), s3c: clip(j.s3c, 14),
    period: clip(j.period, 40), source: clip(j.source, 60), sourceUrl: /^https:\/\//.test(url) ? url : "",
  };
  // A change with no figure would print under nothing.
  for (const k of ["s1", "s2", "s3"] as const) if (!out[k]) out[`${k}c` as "s1c"] = "";
  return out;
}
