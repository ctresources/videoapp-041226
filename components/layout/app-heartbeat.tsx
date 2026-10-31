"use client";

import { useEffect } from "react";

/**
 * Time in the app (2026-10-30, the owner's ask): every minute the app is open,
 * visible and was used (a click, key, scroll or touch) in the last 5 minutes,
 * one minute is added to today's total. A tab left open in the background
 * counts nothing. Read in Admin.
 */
const MINUTE = 60_000;
const IDLE = 5 * MINUTE;

export function AppHeartbeat() {
  useEffect(() => {
    let lastInput = Date.now();
    const touch = () => { lastInput = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - lastInput > IDLE) return;
      void fetch("/api/profile/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    }, MINUTE);
    return () => {
      clearInterval(tick);
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);
  return null;
}
