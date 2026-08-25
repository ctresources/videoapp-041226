/**
 * Did the agent just say to go ahead?
 *
 * Decided in code, never asked of the model. Consent is a high-stakes binary —
 * a wrong yes starts a render they pay for — and when the model was asked, it
 * answered false to a plain "yes go ahead", which is the other failure: you say
 * it and nothing happens. A short matcher is duller and far more predictable.
 *
 * Lives here rather than beside either session because both use it, and the
 * copy that had been made for the client had already drifted — it never
 * learned "spark video", so the editor's own wake word did nothing there.
 */
export function saidGoAhead(lastUserTurn: string): boolean {
  const t = lastUserTurn.toLowerCase().trim().replace(/[.!\s]+$/, "");
  // Nothing said is not agreement — and the "what is left over" test below
  // reads an empty string as a bare yes if it is allowed to get that far.
  if (!t) return false;

  // "no, don't go ahead" and "not yet" both contain affirmatives, so negation
  // is checked first and wins outright — including over the wake word.
  if (/\b(no|nope|not yet|don'?t|do not|wait|hold on|hang on|stop|cancel|change)\b/.test(t)) {
    return false;
  }

  // "Spark script" writes the script, "Spark video" renders it. The brand name
  // still counts because it was the wake word first and people learned it.
  // Speech recognition splits all of them as often as not, so "sparkscript",
  // "spark reels" and "sparkreel" have to match too.
  if (/(^|\b)spark\s?(script|video|reels?)(\b|$)/.test(t)) return true;

  // "Spark it" is what people actually say — it is the product's own phrase for
  // generating, and being told to say "Spark script" does not stop someone
  // saying it. Anchored to the end, like "make it" below, so "spark it up with
  // something about schools" stays a refinement rather than a go.
  if (/\bspark\s?it\b$/.test(t)) return true;

  // Everything else counts only when agreement is the WHOLE of what was said.
  //
  // These used to match anywhere in the sentence, described as unambiguous.
  // They are not. The session signs off by asking "Want to go ahead?", and the
  // natural answer to that is "yes, and make it for first-time buyers" — one
  // word of agreement carrying a real change behind it. Matching "yes" fired a
  // paid render and threw the audience away in the same move.
  //
  // So rather than look for agreement, take it out and see what is left. If
  // nothing is, they only agreed. If anything is, they said something.
  const rest = t
    .replace(
      /\b(go ahead|go for it|generate it|let'?s go|that'?s right|sounds good|thank you|all right|alright|yes|yeah|yep|yup|sure|ok|okay|perfect|correct|great|good|ready|do it|make it|generate|it|i'?m|we'?re|please|thanks|now|then|and|so)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // "yes", "go ahead now please", "yeah I'm ready" → nothing left, it is a go.
  // "make it shorter", "yes but for sellers" → "shorter", "but for sellers"
  // still there, so it is a change and the conversation continues.
  return rest === "";
}
