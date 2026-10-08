/**
 * A market update says where its numbers came from.
 *
 * The owner asked for this after reading a few: a median price stated flat,
 * with nothing to say whose figure it was. Looking at what the research had
 * actually drawn on over ninety days, the well-known sources were the
 * minority. Of sixteen market scripts, Realtor.com was behind three, Zillow
 * two and Redfin one; several leaned on other agents' and brokerages' sites,
 * which is a competitor's blog quoted as fact in an agent's own video.
 *
 * So for a market update, and only for one, the research is pointed at the
 * three sources a buyer has heard of, and the script and the article name the
 * one a figure came from. "Prefer", not "only": small towns are often missing
 * from all three, and a rule that could not be met would be met by inventing.
 *
 * Not applied when the agent attached their own material (a forwarded market
 * report): those numbers are the report's, and it is written from that.
 */

/**
 * Whether a topic is a market update: prices, inventory, pace. Deliberately
 * not anything that merely mentions money. "What today's rates mean for a
 * monthly payment" is an explainer, and the owner asked for market updates.
 */
const MARKET_TOPIC =
  /\bmarket\s+(?:update|report|snapshot|recap|stats?|statistics|numbers|trends?|conditions|watch|check[- ]?in)\b|\b(?:housing|real\s+estate|home|property)\s+market\b|\bmedian\s+(?:home\s+|sale\s+|sales\s+|list(?:ing)?\s+)?prices?\b|\bhome\s+(?:prices|values)\b|\bdays\s+on\s+(?:the\s+)?market\b|\bmonths\s+of\s+(?:supply|inventory)\b|\b(?:housing|home)\s+inventory\b/i;

export function isMarketUpdateTopic(topic: string | null | undefined): boolean {
  return !!topic && MARKET_TOPIC.test(topic);
}

/** For anything spoken: the script sections, or a teleprompter script. */
export const MARKET_SOURCES_SCRIPT = `
MARKET DATA SOURCES (this is a market update, so where a number came from is part of what is said):
- Look first at Redfin, Realtor.com and Zillow for this place. Search "redfin [city] [state] housing market", "realtor.com [city] [state] housing market" and "zillow [city] [state] home values". A report from the local MLS or Realtor association is as good when one exists.
- Prefer those over another agent's, team's or brokerage's website or blog. Use one of those only when none of the sources above has the figure, and never name another agent, team or brokerage in anything spoken or written.
- Name the source out loud, in plain spoken words, for the headline figure: "According to Redfin, the median sale price here was about $450,000 in September." Say the month or period the figure is for. Once or twice is right. Do not attach a source to every sentence.
- This is the one exception to the rule against citations in the narration: a source named in words is wanted here. Bracket markers like [2] and web addresses are still forbidden.
- Only name a source you actually took that figure from. Never credit Redfin, Realtor.com or Zillow for a number you found somewhere else: name where it really came from, or leave it unnamed. If the sources disagree, use one per figure and say which.
- Say what the figure measures. Redfin and Realtor.com report sale and listing prices; Zillow's headline number is an estimated typical home value. Do not present one as the other.
- Report figures for the whole town or zip code: median sale price, median list price, typical home value, days on market, sale-to-list ratio, homes sold, homes for sale. Do NOT quote an individual listing, a street, an address, or one home's price or estimate. Those are other agents' listings and single data points, not the market. If you can only find individual listings, say less rather than list them.`;

/** For the article written alongside the script. */
export const MARKET_SOURCES_BLOG = `
MARKET DATA SOURCES IN THE ARTICLE: name the source beside each key figure, inside the sentence ("Redfin put the median sale price at $450,000 in September"), under the same rules as the narration. End the BLOG POST CONCLUSION with one last line on its own beginning "Sources:" that names each site the figures came from and the month of the data, for example "Sources: Redfin and Realtor.com, September data." Names only, no web addresses.`;
