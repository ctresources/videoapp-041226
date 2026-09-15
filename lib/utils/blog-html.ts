/**
 * A generated article as website-ready HTML.
 *
 * The blog writer returns plain text with "H2:" and "H3:" heading markers and
 * paragraphs separated by blank lines. This turns that into the markup a
 * website expects, so the whole point of the feature — paste it into your
 * blog — doesn't require the agent to re-add every heading by hand.
 *
 * The one copy. The editor's Share Kit and the Spark card both call this, so
 * Copy as HTML gives identical output from either. There used to be two, and
 * they drifted: the Spark card's had no headline, no H3 and no header image.
 */
export function blogAsHtml(sections: {
  headline?: string;
  /** Made in the image generator; goes first, above the <h1>. */
  headerUrl?: string;
  intro: string;
  body: string;
  conclusion: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (s: string) => esc(s).replace(/"/g, "&quot;");
  const blocks: string[] = [];
  // The header image goes first, above the <h1>, the way an article page
  // leads with its picture. Alt text is the headline, which is what it shows.
  if (sections.headerUrl?.startsWith("https://")) {
    blocks.push(`<img src="${attr(sections.headerUrl)}" alt="${attr(sections.headline?.trim() || "")}">`);
  }
  // The one <h1> on the page, and the line a search or answer engine reads
  // first. Omitted when the article predates headlines rather than emitted
  // empty — a blank <h1> is worse for the same surfaces than none.
  if (sections.headline?.trim()) blocks.push(`<h1>${esc(sections.headline.trim())}</h1>`);
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(`<p>${esc(para.join(" "))}</p>`);
    para = [];
  };
  // Line by line rather than by blank-line block. The model does not reliably
  // leave a blank line after a heading, and treating a whole block as one
  // unit swallowed the paragraphs under it into the <h2>.
  for (const chunk of [sections.intro, sections.body, sections.conclusion]) {
    if (!chunk?.trim()) continue;
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.trim();
      if (!line) { flush(); continue; }
      if (/^H2:\s*/.test(line)) {
        flush();
        blocks.push(`<h2>${esc(line.replace(/^H2:\s*/, ""))}</h2>`);
        continue;
      }
      // H3 came in with the FAQ sections, where each question is its own
      // subheading. Without this branch the marker went out as literal text
      // inside a paragraph — visible in the HTML someone pastes into their
      // site, and no heading where an answer engine looks for one.
      if (/^H3:\s*/.test(line)) {
        flush();
        blocks.push(`<h3>${esc(line.replace(/^H3:\s*/, ""))}</h3>`);
        continue;
      }
      para.push(line);
    }
    flush();
  }
  return blocks.join("\n");
}
