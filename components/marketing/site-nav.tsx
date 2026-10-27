"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShinyLogo } from "@/components/marketing/shiny-logo";
import { AskSparkleePublic } from "@/components/marketing/ask-sparklee-public";
import { ChevronDown } from "lucide-react";
import { FEATURE_PAGES } from "@/lib/marketing/content";

/**
 * The public site's top bar: the landing page, the feature pages, pricing,
 * FAQ and the blog all share it (2026-10-22). Features is a menu of the
 * feature pages; the rest are plain links.
 */
export function SiteNav({ active }: { active?: "features" | "pricing" | "blog" | "faq" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const link = (on: boolean) =>
    `transition-colors hover:text-slate-900 ${on ? "text-slate-900 underline decoration-amber-500 decoration-2 underline-offset-8" : ""}`;

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* A little smaller on phones, so Log In and Start Free fit on one
            line each (2026-10-22). */}
        <Link href="/" className="flex min-w-0 shrink flex-col leading-none">
          {/* Shines, twinkles, sparks on click (2026-10-26). */}
          <ShinyLogo className="w-[150px] sm:w-[200px]" />
        </Link>
        <div className="hidden md:flex items-center gap-7 text-base font-medium text-slate-600">
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`flex items-center gap-1 ${link(active === "features")}`}
            >
              Features <ChevronDown size={15} />
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-3 w-[300px] border border-slate-200 bg-white py-2 shadow-lg">
                {FEATURE_PAGES.map((f) => (
                  <Link key={f.slug} href={`/${f.slug}`} onClick={() => setOpen(false)} className="block px-4 py-2 hover:bg-slate-50">
                    <span className="block font-semibold text-slate-900">{f.navLabel}</span>
                    <span className="block text-sm text-slate-500">{f.blurb}</span>
                  </Link>
                ))}
                <Link href="/#features" onClick={() => setOpen(false)} className="mt-1 block border-t border-slate-100 px-4 pt-2.5 pb-1 text-sm font-semibold text-[#A3660F] hover:underline">
                  Everything included →
                </Link>
              </div>
            )}
          </div>
          <Link href="/#how-it-works" className={link(false)}>How It Works</Link>
          <Link href="/pricing" className={link(active === "pricing")}>Pricing</Link>
          <Link href="/blog" className={link(active === "blog")}>Blog</Link>
          <Link href="/faq" className={link(active === "faq")}>FAQ</Link>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Link href="/login" className="whitespace-nowrap text-base font-medium text-slate-600 hover:text-slate-900 transition-colors px-2 sm:px-3 py-2">
            Log In
          </Link>
          <Link href="/beta" className="whitespace-nowrap text-base font-semibold bg-spark-amber text-white px-3.5 sm:px-5 py-2.5 hover:bg-[#A3660F] transition-colors flex items-center gap-1.5">
            Start Free
          </Link>
        </div>
      </div>
    </nav>
    {/* Ask Sparklee on every website page (2026-10-26). */}
    <AskSparkleePublic />
    </>
  );
}
