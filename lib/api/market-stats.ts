import { perplexityChat } from "@/lib/api/perplexity";

/**
 * The figures an article already contains, pulled out so they can be drawn.
 *
 * A market-report card is four numbers and their labels. Asking an agent to
 * retype them from an article they just generated is asking them to copy from
 * one window into another, which is how a median price ends up off by a digit.
 *
 * What this will not do is supply a number the article does not have. Every
 * figure on that card is a market claim published under the agent's name and
 * their brokerage's licence, so an empty row is the correct output when the
 * piece does not say — and the row stays on screen, empty, for them to fill or
 * leave out. A plausible invented median is the one failure here that costs
 * somebody something real.
 */
export interface MarketStat {
  label: string;
  value: string;
}

export interface MarketStatsResult {
  stats: MarketStat[];
  /** e.g. "September 2026", when the piece says which period it covers. */
  period: string;
}

/** Short enough to sit on a card, long enough to mean something. */
const MAX_LABEL = 28;
const MAX_VALUE = 14;

export async function marketStatsFrom(opts: {
  headline: string;
  body: string;
  city?: string;
  state?: string;
}): Promise<MarketStatsResult> {
  const body = (opts.body || "").replace(/\s+/g, " ").trim().slice(0, 6000);
  if (!body) return { stats: [], period: "" };
  const where = [opts.city, opts.state].filter(Boolean).join(", ");

  try {
    const raw = await perplexityChat([
      {
        role: "system",
        content:
          "You extract figures that are already written in a document. You never estimate, never round, and never supply a figure the document does not state. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Pull the market figures out of this article for a stat card.

HEADLINE: "${opts.headline}"
${where ? `MARKET: ${where}\n` : ""}ARTICLE: "${body}"

RULES:
- At most 4 figures, the four a reader would most want: things like median sold price, months of inventory, days on market, sold-to-list ratio, number of homes sold, year-over-year change.
- Every figure MUST appear in the article. If the article gives fewer than four, return fewer. Never estimate or infer one.
- Keep the article's own number exactly, including its $ , % or symbol. Value at most ${MAX_VALUE} characters.
- Label in title case, at most ${MAX_LABEL} characters, no trailing colon.
- "period" is the month and year the article covers, if it says one, else "".

Return ONLY this JSON: {"period": "", "stats": [{"label": "", "value": ""}]}`,
      },
    ], "sonar");

    let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    const parsed = JSON.parse(text) as { period?: string; stats?: { label?: string; value?: string }[] };

    const stats: MarketStat[] = (parsed.stats ?? [])
      .map((s) => ({
        label: String(s.label ?? "").trim().slice(0, MAX_LABEL),
        value: String(s.value ?? "").trim().slice(0, MAX_VALUE),
      }))
      // A label with no figure is a row that would print as a heading over
      // nothing, which is worse than one fewer stat.
      .filter((s) => s.label && s.value)
      .slice(0, 4);

    return { stats, period: String(parsed.period ?? "").trim().slice(0, 40) };
  } catch (err) {
    // The card still works: the rows are on screen and can be typed into.
    console.error("[market-stats] extraction failed:", err instanceof Error ? err.message : err);
    return { stats: [], period: "" };
  }
}
