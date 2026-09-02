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
  if (normalise(first) === h) {
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
