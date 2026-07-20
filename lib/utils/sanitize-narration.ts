/**
 * Convert AI/research-formatted text into plain speakable prose for TTS.
 *
 * The video render sends script text to HeyGen labeled "speak word-for-word".
 * Markdown, bullets, citation markers, emoji, and section labels are not
 * speakable, so the Video Agent silently rewrites such scripts in its own
 * words — changing facts (e.g. the sale price), shortening the runtime, and
 * dropping the user's CTA. Everything non-speakable must be stripped before
 * the script reaches the render prompt.
 */
export function sanitizeNarration(text: string): string {
  if (!text) return text;
  let out = text;

  // Markdown links: keep the visible text, drop the URL.
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Research citation markers: [2], [3,7], [2-4]
  out = out.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "");
  // Markdown emphasis / inline code — strip the markers, keep the words.
  out = out.replace(/(\*\*|__|\*|`)/g, "");
  // Emoji and their joiners/variation selectors (a voice cannot speak them).
  // Constructed at runtime: literal \p{...} regexes need an es2018+ TS target.
  const emojiRe = new RegExp("[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}]", "gu");
  out = out.replace(emojiRe, "");
  // Math/typographic symbols TTS mangles: ≈ → "about", numeric ranges → "to".
  out = out.replace(/≈\s*/g, "about ");
  out = out.replace(/(\d)\s*[–—]\s*(?=\$?\d)/g, "$1 to ");

  const cleaned: string[] = [];
  for (const rawLine of out.split("\n")) {
    let line = rawLine.trim();
    // Markdown headers: drop the hashes, keep any text.
    line = line.replace(/^#{1,6}\s*/, "");
    // List bullets and numbered-list prefixes.
    line = line.replace(/^[-•▪◦*]\s+/, "").replace(/^\d+[.)]\s+/, "");
    line = line.trim();
    if (!line) {
      cleaned.push("");
      continue;
    }
    // Section labels ("Key Points:", "Market Stats:") — a short line that ends
    // with a colon and carries no sentence content. Labels are layout, not
    // narration; drop them entirely.
    if (line.split(/\s+/).length <= 4 && /:$/.test(line)) continue;
    cleaned.push(line);
  }

  // Ensure each content line ends with punctuation so TTS pauses naturally
  // instead of running list fragments together, then collapse whitespace.
  return cleaned
    .map((l) => (l && !/[.!?…:;,]$/.test(l) ? `${l}.` : l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}
