"use client";

import { CheckCircle, Camera, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const perks = [
  { icon: Camera, text: "Unlimited camera recordings — record yourself on camera, free forever, no cap." },
  { icon: Sparkles, text: "1 free AI-generated video — see your AI avatar + voice come to life." },
  { icon: CheckCircle, text: "Built-in teleprompter — your script scrolls while you record." },
  { icon: CheckCircle, text: "AI script writer — speak a topic, AI writes a broadcast-quality script in seconds." },
  { icon: CheckCircle, text: "No credit card required." },
];

export default function BetaPage() {
  const [capacity, setCapacity] = useState<{ open: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/capacity")
      .then((r) => r.json())
      .then(setCapacity)
      .catch(() => setCapacity({ open: true }));
  }, []);

  async function handleGoogle() {
    if (!capacity?.open) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  const isFull = capacity ? !capacity.open : false;

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-slate-200 px-6 h-14 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="text-sm font-bold text-blue-900">SparkReels</span>
        <a href="/login" className="text-sm text-slate-500 hover:text-slate-700">Already have an account? Sign in</a>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
          Beta — Limited Access
        </span>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-4 max-w-2xl">
          Be one of the first 100 agents<br />
          <span className="text-blue-900">to get free access.</span>
        </h1>
        <p className="text-lg text-slate-500 mb-8 max-w-xl">
          Sign up with Google — no credit card, no invite code needed.
          You get 1 free AI video + unlimited camera recordings.
        </p>

        {/* Perks */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 max-w-md w-full text-left">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">What you get free</p>
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
        {isFull ? (
          <div className="text-center">
            <p className="text-slate-600 font-semibold mb-2">All beta spots are taken.</p>
            <p className="text-sm text-slate-400">
              Email us at{" "}
              <a href="mailto:support@sparkreels.ai" className="text-blue-600 hover:underline">
                support@sparkreels.ai
              </a>{" "}
              to get on the waitlist.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleGoogle}
              disabled={loading || !capacity}
              className="inline-flex items-center gap-3 bg-white border border-slate-300 text-slate-700 text-sm font-semibold px-8 py-3.5 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {loading ? "Redirecting..." : "Continue with Google"}
            </button>
            <p className="text-xs text-slate-400">No credit card required · Cancel anytime</p>
          </div>
        )}

        <p className="mt-10 text-xs text-slate-400 max-w-sm">
          Questions? Email{" "}
          <a href="mailto:support@sparkreels.ai" className="text-blue-600 hover:underline">
            support@sparkreels.ai
          </a>
        </p>
      </main>
    </div>
  );
}
