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

  // Unambiguous anywhere in the sentence.
  if (/(^|\b)(go ahead|go for it|generate it|let'?s go|yes|yep|yeah|yup|that'?s right|sounds good|perfect|correct)(\b|$)/.test(t)) {
    return true;
  }

  // "make it", "do it" and bare "generate" only count as the last thing said.
  // "make it about schools" and "make it shorter" are the user refining the
  // brief, not agreeing to it, and firing a paid render on those is the exact
  // mistake this function exists to avoid.
  return /\b(make it|do it|generate)(\s+(now|please|then|thanks|thank you))*$/.test(t);
}
