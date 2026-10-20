"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Microsoft Clarity: recordings and heatmaps of how people use SparkReels
 * (2026-10-20, the owner's ask; project z0tfc6nfor).
 *
 * Kept inside SparkReels' promise to Google (the verified OAuth app, and the
 * Privacy Policy's "Receives no Google user data"):
 * - PUBLIC pages are recorded as they are; Clarity hides typed input itself.
 * - Everywhere INSIDE the app the whole page is masked, so a recording shows
 *   layout, clicks and scrolling but none of the words or pictures.
 * - Pages that show Google data (YouTube numbers, Google Reviews, connected
 *   accounts) are NOT recorded: recording pauses while one is open, and
 *   Clarity doesn't load at all until a page it may record is visited.
 *
 * Production only, so local and preview builds never send anything.
 */
const PROJECT_ID = "z0tfc6nfor";

/** Shown as they are. Exact paths; everything else is inside the app. */
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/beta", "/privacy", "/terms", "/affiliates"];

/** Never recorded: they show Google user data, or other people's. */
const NOT_RECORDED = ["/analytics", "/dashboard", "/settings/social", "/social", "/tools", "/admin"];

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

export function Clarity() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") return;

    const isPublic = PUBLIC_PATHS.includes(pathname);
    const blocked = NOT_RECORDED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

    // Mask the whole page inside the app; set before anything is captured.
    if (isPublic) document.body.removeAttribute("data-clarity-mask");
    else document.body.setAttribute("data-clarity-mask", "True");

    const w = window as unknown as { clarity?: ClarityFn };
    if (blocked) {
      w.clarity?.("pause");
      return;
    }
    if (w.clarity) {
      w.clarity("resume");
      return;
    }

    // Clarity's own snippet, as given in its install page.
    const q = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      (q.q = q.q || []).push(arguments as unknown as unknown[]);
    } as ClarityFn;
    w.clarity = q;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${PROJECT_ID}`;
    document.head.appendChild(s);
  }, [pathname]);

  return null;
}
