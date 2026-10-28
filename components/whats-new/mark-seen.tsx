"use client";

import { useEffect } from "react";
import { WHATS_NEW_SEEN_EVENT } from "@/lib/data/whats-new";
import { track } from "@/lib/track";

/**
 * On opening What's New: records the newest update as seen, clears the menu's
 * dot at once, and logs whats_new_viewed. Renders nothing.
 */
export function MarkWhatsNewSeen() {
  useEffect(() => {
    track("whats_new_viewed");
    window.dispatchEvent(new Event(WHATS_NEW_SEEN_EVENT));
    fetch("/api/whats-new/seen", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
