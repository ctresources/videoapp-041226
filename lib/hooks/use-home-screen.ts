"use client";

import { useEffect, useState } from "react";

/**
 * Putting SparkReels on a phone's Home Screen (2026-10-17).
 *
 * iPhones cannot be asked to do it: Safari only offers it from its own Share
 * menu, so on an iPhone this can only tell people where to tap. Android's
 * Chrome fires `beforeinstallprompt` once a page qualifies, and keeping that
 * event is what lets an Add button do it in one tap.
 *
 * The event fires once, soon after the page loads, so it is caught at module
 * level (this file is imported by the dashboard layout) rather than inside a
 * component that may mount after it has gone by.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export interface HomeScreenState {
  /** Opened from the Home Screen icon, not a browser tab. */
  standalone: boolean;
  platform: "ios" | "android" | "other";
  /** A phone or tablet browser, where a Home Screen icon makes sense. */
  isPhone: boolean;
  /** Android has offered its install prompt, so Add can do it in one tap. */
  canInstall: boolean;
  /** Shows Android's prompt. True when the person accepted it. */
  install: () => Promise<boolean>;
  /** False until the browser has been checked, so nothing flashes in first. */
  ready: boolean;
}

export function useHomeScreen(): HomeScreenState {
  const [, rerender] = useState(0);
  const [info, setInfo] = useState({ standalone: false, platform: "other" as HomeScreenState["platform"], isPhone: false, ready: false });

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInfo({
      standalone,
      platform: ios ? "ios" : android ? "android" : "other",
      isPhone: (ios || android) && window.matchMedia("(pointer: coarse)").matches,
      ready: true,
    });
    return () => { listeners.delete(listener); };
  }, []);

  async function install(): Promise<boolean> {
    const event = deferred;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    deferred = null;
    rerender((n) => n + 1);
    return choice.outcome === "accepted";
  }

  return { ...info, canInstall: !!deferred, install };
}
