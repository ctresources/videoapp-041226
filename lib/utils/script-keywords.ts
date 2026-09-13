/**
 * What a script is about, in a handful of words.
 *
 * Used for two things, both of which only need a rough answer: searching stock
 * footage, and the render prompt's emphasis line. A script written by the AI
 * arrives with keywords already; one that was pasted or summarised does not,
 * and an empty list meant the stock search fell back to the town alone — the
 * same few generic neighbourhood clips behind every pasted video, however
 * specific the script.
 *
 * Deliberately counted rather than modelled. This runs on every save, and a
 * model call would add a wait and a failure mode to a feature whose whole
 * output is a few search terms.
 */

/**
 * Words too common to describe anything.
 *
 * Includes the vocabulary every real estate script shares — "home", "market",
 * "buyer" — because a term that appears in all of them distinguishes none of
 * them, and searching stock footage for "home" returns exactly the generic
 * results this exists to avoid.
 */
const STOP = new Set([
  // ordinary English
  "the", "and", "for", "you", "your", "yours", "that", "this", "these", "those",
  "with", "from", "have", "has", "had", "are", "was", "were", "been", "being",
  "will", "would", "could", "should", "can", "may", "might", "must", "shall",
  "not", "but", "all", "any", "our", "out", "who", "what", "when", "where",
  "why", "how", "here", "there", "then", "than", "them", "they", "their",
  "its", "it's", "into", "onto", "over", "under", "about", "after", "before",
  "more", "most", "some", "such", "only", "just", "also", "very", "much",
  "many", "each", "every", "both", "few", "own", "same", "too", "get", "got",
  "one", "two", "three", "make", "makes", "made", "take", "takes", "want",
  "wants", "need", "needs", "know", "knows", "like", "likes", "look", "looks",
  "come", "comes", "help", "helps", "let", "lets", "see", "say", "says",
  "way", "well", "back", "even", "still", "because", "while", "through",
  "between", "around", "right", "left", "first", "last", "next", "new",
  "good", "great", "best", "better", "little", "long", "own", "put", "give",
  "find", "think", "going", "really", "something", "anything", "everything",
  // shared real-estate vocabulary: true of every script, so it separates none
  "home", "homes", "house", "houses", "market", "buyer", "buyers", "seller",
  "sellers", "agent", "agents", "real", "estate", "property", "properties",
  "price", "prices", "listing", "listings", "sale", "sell", "buy", "move",
  "moving", "area", "areas", "local", "today", "call", "text", "contact",
]);

/**
 * The most-repeated meaningful terms in a script, longest-first on ties.
 *
 * Two-word phrases are counted alongside single words and weighted above them:
 * "train station" and "school district" are searchable in a way that "train"
 * and "school" on their own are not.
 */
export function topTerms(text: string, limit = 5): string[] {
  const words = (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2);

  const counts = new Map<string, number>();
  const bump = (term: string, by: number) => {
    counts.set(term, (counts.get(term) ?? 0) + by);
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!STOP.has(w)) bump(w, 1);

    // A pair is only worth counting when BOTH halves carry meaning; "the
    // station" and "station is" are noise wearing a phrase's clothes.
    const next = words[i + 1];
    if (next && !STOP.has(w) && !STOP.has(next)) {
      // Weighted above single words: a phrase that survives this filter is a
      // far better search term than either of its halves.
      bump(`${w} ${next}`, 2.2);
    }
  }

  /**
   * Overlapping phrases collapse to the strongest one.
   *
   * Every word is counted both alone and in a pair with each neighbour, so one
   * idea arrives as a row of near-duplicates: "interest rates", "rates
   * dropped", "rates matter" and "afford rates" are four ways of saying the
   * same thing. Left in, they take four of the five slots and the stock search
   * asks for the same footage four times.
   *
   * Ranked first, then each candidate is kept only if it shares no word with a
   * term already chosen.
   */
  // Array.from rather than a spread: this project's compile target cannot
  // iterate a Map's entries directly.
  const ranked = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  const picked: string[] = [];
  const claimed = new Set<string>();
  for (const [term] of ranked) {
    const parts: string[] = term.split(" ");
    if (parts.some((p: string) => claimed.has(p))) continue;
    picked.push(term);
    parts.forEach((p: string) => claimed.add(p));
    if (picked.length === limit) break;
  }
  return picked;
}
