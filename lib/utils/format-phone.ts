/**
 * A phone number as it should be READ, not as it was stored.
 *
 * Profiles hold whatever was typed, and what gets typed is usually ten bare
 * digits — which then went straight onto the video's contact card as
 * "6104578698". Nobody writes a phone number that way, and on a card a viewer
 * has a few seconds to read, an unbroken ten-digit run is close to unreadable.
 *
 * Display only. The stored value is left exactly as entered: normalising on
 * save would mean rewriting existing rows and second-guessing anyone whose
 * number does not fit the shape below.
 */

/** Dashes rather than parentheses: shorter, and unambiguous in a "·"-separated line. */
function group(ten: string): string {
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function formatPhone(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";

  const digits = text.replace(/\D/g, "");

  // Ten digits, however they were punctuated on the way in.
  if (digits.length === 10) return group(digits);

  // The US country code, which the render prompt already forbids showing —
  // "no leading 1, no country code" — so it is dropped rather than displayed.
  if (digits.length === 11 && digits.startsWith("1")) return group(digits.slice(1));

  // Anything else is left alone: an international number, an extension, or
  // something already formatted the way its owner wants it. Guessing at those
  // would be worse than printing what they typed.
  return text;
}

/** formatPhone over a list, dropping anything empty. */
export function formatPhones(raws: (string | null | undefined)[]): string[] {
  return raws.map(formatPhone).filter(Boolean);
}
