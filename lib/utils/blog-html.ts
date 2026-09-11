/**
 * A generated article as website-ready HTML.
 *
 * The blog writer returns plain text with "H2:" heading markers and
 * paragraphs separated by blank lines. This turns that into the markup a
 * website expects, so the whole point of the feature — paste it into your
 * blog — doesn't require the agent to re-add every heading by hand.
 *
 * Same conversion as blogAsHtml in the editor (create/[projectId]/page.tsx),
 * so Copy as HTML gives identical output from the editor and the campaign
 * calendar.
 */
export function blogAsHtml(sections: { intro: string; body: string; conclusion: string }): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks: string[] = [];
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
      para.push(line);
    }
    flush();
  }
  return blocks.join("\n");
}
