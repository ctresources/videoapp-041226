/**
 * The FAQ every article ends its body with.
 *
 * Two things were wrong. Only one of the two article writers asked for FAQs at
 * all: an article written from a recording or a pasted script got them, and
 * the commonest kind, written alongside an AI script, got none. And where
 * they were asked for, the questions were whatever the model supposed a reader
 * might ask, with nothing checked against what people do ask.
 *
 * So both writers take this, the owner chose six, and the questions are looked
 * for before they are written. The heading is fixed wording because Copy as
 * HTML reads the section back out to build its FAQ schema (blog-html.ts), and
 * a heading phrased differently each time could not be found.
 *
 * @param place    The town, or a phrase standing in for one.
 * @param facts    Where an answer's facts may come from, in the prompt's own
 *                 terms: "your research", or "the script".
 */
export const FAQ_HEADING = "Frequently Asked Questions";

export function faqInstruction(place: string, facts: string): string {
  return `- FAQ: after the body's last section, add one more section headed with a line that reads exactly "H2: ${FAQ_HEADING}". Under it put exactly six question-and-answer pairs: the question on its own line beginning exactly "H3: ", and the answer directly beneath it in one paragraph of 40 to 70 words. Open each answer with a complete one-sentence answer before any elaboration. These are the paragraphs an answer engine is most likely to quote on their own, so each must make sense with nothing around it: name ${place} and the specifics rather than saying "this area" or "as mentioned above".
- WHICH SIX QUESTIONS: search for what people actually ask about this subject in ${place} (the "People also ask" questions on a search results page, questions on forums and Q&A sites, the way someone would put it to an AI assistant) and use those, in the words people use. Where you find fewer than six, make up the number with the next questions a reader of this article would ask. Do not repeat a question already used as a section heading above.
- Answer from ${facts} only. Never invent a figure to make an answer sound complete; an answer without a number is better than one with a made-up number.`;
}
