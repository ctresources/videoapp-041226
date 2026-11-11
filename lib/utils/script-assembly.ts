/**
 * Joining a hook to the script it opens.
 *
 * The two are generated as separate fields and then spoken one after the
 * other, which is fine right up until the script writes its own opening line
 * as well — and it was being asked to, since its stated structure began "hook
 * → market overview → ...". The result is a video whose first sentence is said
 * twice, once by each field, which is exactly what it sounds like.
 *
 * The prompt no longer asks for a hook inside the script. This is the other
 * half: every project generated before that change still has one baked in, and
 * they should not have to be regenerated to stop stuttering.
 */

/** Punctuation and spacing removed, so "Just listed!" matches "Just listed". */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First sentence, by terminal punctuation — falling back to the whole thing. */
function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

/**
 * The script with its opening line removed if that line is the hook.
 *
 * Two ways it can be a repeat, and both happen: the script starts with the
 * hook verbatim, or it starts with a sentence that IS the hook but punctuated
 * differently. Anything less exact is left alone — a script that merely opens
 * on a similar theme is not a duplicate, and silently deleting a real first
 * sentence is a worse failure than leaving a clumsy one in.
 */
export function dropDuplicateHook(hook: string, script: string): string {
  const h = normalise(hook);
  const s = script.trim();
  if (!h || !s) return s;

  const first = firstSentence(s);
  // Exact, or a near copy (2026-11-11): Abby's hook was "Is now a good time to
  // buy a home in Blue Bell, PA?" and her script opened "Is now a good time to
  // buy a home in Blue Bell?" — one word apart, so both were spoken. Repeats
  // further in are dropped on the server (dropRepeatsOfOpening).
  if (normalise(first) === h || nearlySame(hook, first)) {
    return s.slice(first.length).replace(/^[\s"'“‘]+/, "").trim();
  }

  // Verbatim prefix, for a hook that carries no terminal punctuation of its own
  // and so does not read as a "sentence" above.
  if (normalise(s).startsWith(h)) {
    // Walk the original forward until the same number of meaningful characters
    // has been consumed — the normalised and original strings do not share
    // offsets once punctuation is stripped.
    let consumed = 0;
    let i = 0;
    for (; i < s.length && consumed < h.replace(/ /g, "").length; i++) {
      if (/[a-z0-9']/i.test(s[i])) consumed++;
    }
    return s.slice(i).replace(/^[\s.,;:!?"'“‘—-]+/, "").trim();
  }

  return s;
}

/** The words of a sentence, as a set, for comparing near copies. */
function wordSet(text: string): Set<string> {
  return new Set(normalise(text).split(" ").filter(Boolean));
}

/**
 * Whether two sentences say the same thing in nearly the same words: at least
 * 80% of the words shared, counted against the longer one. Catches ", PA"
 * added, "So," in front, different punctuation. Sentences under four words
 * must match exactly, so a short line like "Here's why." is never lost to a
 * loose match.
 */
function nearlySame(a: string, b: string): boolean {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 || wb.size === 0) return false;
  if (wa.size < 4 || wb.size < 4) return normalise(a) === normalise(b);
  // Different numbers mean different facts, however alike the wording.
  const nums = (w: Set<string>) => Array.from(w).filter((x) => /^\d+$/.test(x)).sort().join(" ");
  if (nums(wa) !== nums(wb)) return false;
  let shared = 0;
  wa.forEach((w) => { if (wb.has(w)) shared++; });
  return shared / Math.max(wa.size, wb.size) >= 0.8;
}

/** Sentences, split after . ! ? (and any closing quote) that a space follows. */
function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?]["'”’)\]]*)\s+/).filter((x) => x.trim());
}

/**
 * The script with every sentence removed that repeats one of `alreadySaid`
 * (the hook, the title) in the same or nearly the same words.
 *
 * Returns the script untouched when nothing repeats, so the usual case keeps
 * its exact spacing and line breaks.
 */
export function dropRepeatedSentences(script: string, alreadySaid: string[]): string {
  const s = (script ?? "").trim();
  const said = alreadySaid.map((x) => x.trim()).filter(Boolean);
  if (!s || said.length === 0) return s;
  let changed = false;
  const paragraphs: string[] = [];
  for (const para of s.split(/\n\s*\n/)) {
    const kept: string[] = [];
    for (const sentence of splitSentences(para)) {
      if (said.some((x) => nearlySame(x, sentence))) { changed = true; continue; }
      kept.push(sentence);
    }
    if (kept.length) paragraphs.push(kept.join(" "));
    else changed = true;
  }
  return changed ? paragraphs.join("\n\n") : s;
}

/**
 * The spoken script with no repeat of its opening or of the title (2026-11-11).
 *
 * The render receives hook and script already joined, hook first with a blank
 * line after it. That opening paragraph is kept as it is; any later sentence
 * that says it again, or says the title, is dropped. Run on the server so
 * every way into a render gets it, drafts written before the fix included.
 */
export function dropRepeatsOfOpening(script: string, title?: string): string {
  const s = (script ?? "").trim();
  const split = s.search(/\n\s*\n/);
  if (split < 0) return s;
  const opening = s.slice(0, split).trim();
  const rest = s.slice(split).trim();
  // A title that names the place with " — City, ST" is compared without it.
  const cleanTitle = (title ?? "").replace(/\s+[—–-]\s+[^—–-]+,\s*[A-Z]{2}\s*$/, "").trim();
  const body = dropRepeatedSentences(rest, [...splitSentences(opening), cleanTitle]);
  return body ? `${opening}\n\n${body}` : opening;
}

/**
 * Hook and script as one spoken script, without saying the opening twice.
 *
 * The blank line between them is what the renderers already expect as a
 * paragraph break, so the pacing is unchanged from before this existed.
 */
export function joinHookAndScript(hook: string, script: string): string {
  const h = hook.trim();
  const body = dropDuplicateHook(h, script ?? "");
  return [h, body].filter(Boolean).join("\n\n");
}

/** Last sentence, by terminal punctuation — falling back to the whole thing. */
function lastSentence(text: string): string {
  const t = text.trim();
  const m = t.match(/[^.!?]*[.!?]\s*$/);
  return (m ? m[0] : t).trim();
}

/**
 * The script with its closing line removed if that line is the CTA.
 *
 * The same bug as the hook, at the other end, and it was live on every listing
 * video. The script prompt asked for a closing call to action AND the JSON
 * asked for a separate "cta" field, so the model wrote it twice; create-blog
 * then appends the cta field to the body, and the avatar says the whole thing
 * through a second time.
 *
 * Verified against the database rather than reasoned about: the newest listing
 * ended "...this one is ready for you. Schedule your private showing today with
 * Carmella Thompson." and its cta field was, exactly, "Schedule your private
 * showing today with Carmella Thompson."
 *
 * Exact matches only, like the hook version. A close is often a rephrasing of
 * the same idea, and deleting a real final sentence because it rhymes with the
 * CTA is a worse failure than leaving a repetitive one in.
 *
 * The Fair Housing line is exempted: "Equal Housing Opportunity" is required
 * wording and both fields may legitimately carry it, so it is stripped before
 * comparing and left wherever it already sits.
 */
export function dropDuplicateCta(cta: string, script: string): string {
  const withoutFairHousing = (t: string) =>
    normalise(t).replace(/\bequal housing opportunity\b/g, "").replace(/\s+/g, " ").trim();

  const c = withoutFairHousing(cta ?? "");
  const s = (script ?? "").trim();
  if (!c || !s) return s;

  const last = lastSentence(s);
  if (withoutFairHousing(last) === c) {
    return s.slice(0, s.length - last.length).trim();
  }

  // Two sentences, for a CTA that carries its own Fair Housing sentence after
  // the ask — "Schedule a showing today. Equal Housing Opportunity."
  const head = s.slice(0, s.length - last.length).trim();
  const penultimate = lastSentence(head);
  if (penultimate && withoutFairHousing(`${penultimate} ${last}`) === c) {
    return head.slice(0, head.length - penultimate.length).trim();
  }

  return s;
}
