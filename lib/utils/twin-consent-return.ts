/**
 * Coming back from HeyGen's Digital Twin approval page (2026-10-24). The
 * approval link is asked to return to the page the agent left with
 * ?twin_consent=done, and that page marks the twin approved, instead of
 * waiting for the agent to press "I've approved it" or for a video to fail.
 */

const PARAM = "twin_consent";

/** The page's address with the "came back from approving" mark on it. */
export function withTwinConsentDone(href: string): string {
  const u = new URL(href);
  u.searchParams.set(PARAM, "done");
  return u.toString();
}

/** True once, when this page load came back from approving; the mark is taken off the address. */
export function takeTwinConsentDone(): boolean {
  if (typeof window === "undefined") return false;
  const u = new URL(window.location.href);
  if (u.searchParams.get(PARAM) !== "done") return false;
  u.searchParams.delete(PARAM);
  window.history.replaceState({}, "", u.toString());
  return true;
}
