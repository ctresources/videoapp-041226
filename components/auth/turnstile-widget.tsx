"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile on the signup form. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, matching the server, which skips
 * the check until its secret is set.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  return new Promise((resolve, reject) => {
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("turnstile script failed")));
    if (!existing) {
      s.src = SCRIPT_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export function TurnstileWidget({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  /** Change it to get a fresh token (each one can be used once). */
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      cb.current(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="flex justify-center empty:hidden" />;
}
