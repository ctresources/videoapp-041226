"use client";

import { CheckCircle, Camera, Sparkles, Clock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";

// What the free account actually is. Kept specific on purpose — a vague
// "1 free AI video" sets people up to be disappointed by the 3-minute cap or
// to go looking for a digital twin they don't have.
const perks = [
  { icon: Sparkles, text: "1 free AI video — one short video, up to 3 minutes long." },
  { icon: Camera,   text: "Photo avatar + your cloned voice. Digital twin is a paid-plan feature." },
  { icon: Camera,   text: "Unlimited camera recordings — record yourself, free forever, no cap." },
  { icon: CheckCircle, text: "Built-in teleprompter — your script scrolls while you record." },
  { icon: CheckCircle, text: "AI script writer, thumbnails, channel banner and the rest of the AI tools." },
  { icon: CheckCircle, text: "No credit card required." },
];

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName: name, source: "beta_page" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Something went wrong");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 max-w-md w-full text-center">
        <CheckCircle size={22} className="text-emerald-600 mx-auto mb-2" />
        <p className="font-bold text-slate-900 mb-1">You&apos;re on the list.</p>
        <p className="text-sm text-slate-600">
          We&apos;ll email you the moment a spot opens. In the meantime you can still
          subscribe to any plan and start today.
        </p>
        <Link href="/#pricing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline mt-3">
          See plans <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 max-w-md w-full text-left">
      <p className="font-bold text-slate-900 mb-1">All 100 beta spots are taken.</p>
      <p className="text-sm text-slate-500 mb-4">
        Leave your email and we&apos;ll let you know as soon as one frees up.
      </p>
      <div className="flex flex-col gap-2.5">
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          {busy ? "Adding you…" : "Join the waitlist"}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-4 text-center">
        Don&apos;t want to wait?{" "}
        <Link href="/#pricing" className="text-blue-700 font-semibold hover:underline">
          Start on a paid plan
        </Link>{" "}
        — those aren&apos;t capped.
      </p>
    </form>
  );
}

export default function BetaPage() {
  const [capacity, setCapacity] = useState<{ open: boolean; remaining?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [bouncedFull, setBouncedFull] = useState(false);

  useEffect(() => {
    fetch("/api/auth/capacity")
      .then((r) => r.json())
      .then(setCapacity)
      .catch(() => setCapacity({ open: true }));

    // ?full=1 — bounced here by the OAuth callback because the beta filled up
    // between loading this page and finishing Google sign-in. Read from
    // location rather than useSearchParams, which would need this whole page
    // wrapped in a Suspense boundary.
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("full") === "1") {
      setBouncedFull(true);
      toast.error("The last beta spot went while you were signing in.");
    }
    // Google signup refused by the spam screen — say why, since otherwise the
    // person is bounced back here with no explanation at all.
    const rejected = qs.get("rejected");
    if (rejected) toast.error(rejected, { duration: 8000 });
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

  const isFull = bouncedFull || (capacity ? !capacity.open : false);
  const remaining = capacity?.remaining;

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-slate-200 px-6 h-14 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="text-sm font-bold text-blue-900">SparkReels</Link>
        <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">Already have an account? Sign in</Link>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
          {isFull ? "Beta — Full" : "Beta — Limited Access"}
        </span>

        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight mb-4 max-w-2xl">
          Be one of the first 100 agents<br />
          <span className="text-blue-900">to get free access.</span>
        </h1>

        {!isFull && (
          <p className="text-lg text-slate-500 mb-8 max-w-xl">
            No credit card, no invite code. Make one AI video free and see your avatar and
            voice before you decide anything.
            {typeof remaining === "number" && remaining <= 25 && (
              <span className="block mt-2 font-semibold text-amber-600">
                Only {remaining} {remaining === 1 ? "spot" : "spots"} left.
              </span>
            )}
          </p>
        )}

        {isFull ? (
          <WaitlistForm />
        ) : (
          <>
            {/* Perks */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6 max-w-md w-full text-left">
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

            {/* What happens next — stated up front rather than discovered later */}
            <div className="flex items-start gap-3 max-w-md w-full text-left bg-white border border-slate-200 rounded-2xl p-4 mb-8">
              <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-700">After your free video:</span> your
                camera recordings and AI tools stay free forever. To make more AI videos — or longer
                ones, up to 8 minutes — you pick a plan. No auto-charge, and nothing expires on you.
              </p>
            </div>

            {/* Google */}
            <div className="flex flex-col items-center gap-3 w-full max-w-md">
              <button
                onClick={handleGoogle}
                disabled={loading || !capacity}
                className="w-full inline-flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 text-sm font-semibold px-8 py-3.5 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? "Redirecting..." : "Continue with Google"}
              </button>

              {/* Not everyone has a Google account — this page used to be
                  Google-only, which left those agents with no way in. */}
              <div className="flex items-center gap-3 w-full my-1">
                <span className="h-px bg-slate-200 flex-1" />
                <span className="text-xs text-slate-400">or</span>
                <span className="h-px bg-slate-200 flex-1" />
              </div>

              <Link
                href="/register"
                className="w-full inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-700 text-sm font-semibold px-8 py-3.5 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors"
              >
                <Mail size={16} /> Sign up with email
              </Link>

              <p className="text-xs text-slate-400 mt-1">No credit card required · Cancel anytime</p>
            </div>
          </>
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
