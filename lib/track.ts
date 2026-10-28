/**
 * A named event in the analytics the app already has (Microsoft Clarity,
 * components/analytics/clarity.tsx). No new vendor: if Clarity is not loaded
 * on this page, nothing happens.
 */
export type TrackEvent =
  | "whats_new_viewed"
  | "whats_new_item_clicked"
  | "whats_new_upgrade_clicked"
  | "how_it_works_locked_clicked"
  | "locked_feature_upgrade_clicked";

export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { clarity?: (...args: unknown[]) => void };
    w.clarity?.("event", event);
  } catch {
    // Analytics never breaks a click.
  }
}
