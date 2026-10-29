/**
 * A video made for Ask for Google Review Video Email (ai_script.kind =
 * "review_request", app/api/review-request). It's a personal ask to past
 * clients, so it is never offered for posting to social accounts
 * (2026-10-29, the owner's call), and the posting route refuses it.
 */
export function isReviewRequest(aiScript: unknown): boolean {
  return !!aiScript && typeof aiScript === "object"
    && (aiScript as { kind?: unknown }).kind === "review_request";
}
