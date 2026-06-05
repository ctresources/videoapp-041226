"use client";

import Link from "next/link";
import { CheckCircle, Camera, Sparkles, ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const perks = [
  { icon: Camera, text: "Unlimited camera recordings — record yourself on camera, free forever, no cap." },
  { icon: Sparkles, text: "1 free AI-generated video — see your AI avatar + voice come to life." },
  { icon: CheckCircle, text: "Built-in teleprompter — your script scrolls while you record." },
  { icon: CheckCircle, text: "AI script writer — speak a topic, AI writes a broadcast-quality script in seconds." },
  { icon: CheckCircle, text: "No credit card required." },
];

function BetaPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const registerHref = code ? `/register?code=${encodeURIComponent(code)}` : "/register";

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-slate-200 px-6 h-14 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="text-sm font-bold text-blue-900">← XpressReel</Link>
        <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">Already have an account? Sign in</Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
          Beta Program
        </span>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-4 max-w-2xl">
          Get free access to XpressReel.<br />
          <span className="text-blue-900">No credit card. No catch.</span>
        </h1>
        <p className="text-lg text-slate-500 mb-8 max-w-xl">
          We&apos;re inviting a small group of real estate agents to try XpressReel for free.
          You get the full product — AI scripts, teleprompter, camera recordings — in exchange for honest feedback.
        </p>

        {/* Perks */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 max-w-md w-full text-left">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">What you get as a beta tester</p>
          <ul className="flex flex-col gap-3">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-slate-700">
                <Icon size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Link
            href={registerHref}
            className="inline-flex items-center gap-2 bg-blue-900 text-white text-sm font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-800 transition-colors"
          >
            {code ? "Claim Your Invite" : "Sign up with an invite code"} <ArrowRight size={15} />
          </Link>
          {!code && <p className="text-xs text-slate-400">Already have a code? Enter it on the sign-up page.</p>}
        </div>

        <p className="mt-10 text-xs text-slate-400 max-w-sm">
          Don&apos;t have a code? Email us at{" "}
          <a href="mailto:hello@xpressreel.com" className="text-blue-600 hover:underline">
            hello@xpressreel.com
          </a>{" "}
          and tell us a little about yourself.
        </p>
      </main>
    </div>
  );
}

export default function BetaPage() {
  return (
    <Suspense>
      <BetaPageContent />
    </Suspense>
  );
}
