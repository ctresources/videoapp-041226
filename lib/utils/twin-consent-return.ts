/**
 * Coming back from HeyGen's Digital Twin approval page (2026-10-24). The
 * approval link is asked to return to the page the agent left with
 * ?twin_consent=done, and that page marks the twin approved, instead of
 * waiting for the agent to press "I've approved it" or for a video to fail.
 *
 * Since 2026-10-29 an account can have two twins, so the mark says which:
 * ?twin_consent=done for the first, ?twin_consent=done2 for the second.
 */

const PARAM = "twin_consent";

/** The page's address with the "came back from approving" mark on it. */
export function withTwinConsentDone(href: string, slot: 1 | 2 = 1): string {
  const u = new URL(href);
  u.searchParams.set(PARAM, slot === 2 ? "done2" : "done");
  return u.toString();
}

/**
 * True once, when this page load came back from approving THIS slot's twin;
 * the mark is taken off the address only then, so the other slot's card can
 * still find its own.
 */
export function takeTwinConsentDone(slot: 1 | 2 = 1): boolean {
  if (typeof window === "undefined") return false;
  const u = new URL(window.location.href);
  if (u.searchParams.get(PARAM) !== (slot === 2 ? "done2" : "done")) return false;
  u.searchParams.delete(PARAM);
  window.history.replaceState({}, "", u.toString());
  return true;
}
