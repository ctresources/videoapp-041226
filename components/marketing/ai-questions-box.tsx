"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";

type Block = { question: string; answerBlock: string; videoTopic: string };

/** Handed to Spark Studio after sign-up on this device (read in create/page.tsx). */
export const PENDING_TOPIC_KEY = "sr_pending_topic";

const STEPS = ["Looking up your town", "Finding what buyers there ask ChatGPT and Google", "Writing an answer for each one"];

/**
 * "What buyers in your area ask AI", in the home page hero where the phone
 * picture was (2026-10-23, the owner's approved mockup). A lead form: name,
 * email and city, then the same research as AI Answer Blocks. Once a day per
 * email; the server says so if it's been used.
 */
export function AiQuestionsBox() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [shownFor, setShownFor] = useState({ first: "", city: "", email: "" });

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const a = setTimeout(() => setStep(1), 2500);
    const b = setTimeout(() => setStep(2), 8000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/public/ai-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, city, company }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(d.blocks)) throw new Error(d.error || "Something went wrong. Please try again.");
      setBlocks(d.blocks);
      setShownFor({ first: name.trim().split(" ")[0], city: city.trim(), email: email.trim() });
      try {
        localStorage.setItem(PENDING_TOPIC_KEY, JSON.stringify({ topic: d.blocks[0]?.videoTopic || d.blocks[0]?.question, at: Date.now() }));
      } catch { /* storage unavailable: the topic just won't be pre-filled */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full border border-slate-300 rounded-lg px-3.5 py-3 text-base text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15";

  return (
    <div className="rounded-2xl border-2 border-blue-900 bg-white p-6 shadow-[0_18px_40px_-20px_rgba(30,58,138,0.35)]">
      {blocks ? (
        <>
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#BA7517] mb-1.5">Your results, {shownFor.first}</p>
          <h2 className="text-2xl font-black leading-tight text-slate-900 mb-4">What buyers in {shownFor.city} ask AI</h2>
          <div className="space-y-2">
            {blocks.map((b, i) => (
              <details key={b.question} open={i === 0} className="group rounded-lg border border-slate-200 px-4 py-3">
                <summary className="cursor-pointer list-none text-[15.5px] font-bold leading-snug text-slate-900">
                  &ldquo;{b.question}&rdquo;
                </summary>
                <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{b.answerBlock}</p>
                {b.videoTopic && <p className="mt-2 text-[13px] font-semibold text-[#BA7517]">Video topic: {b.videoTopic}</p>}
              </details>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-base font-bold text-slate-900">Answer these on video, with your face and voice.</p>
            <p className="mt-0.5 mb-3 text-sm text-amber-900/80">Sign up free and make your first AI video from these questions.</p>
            <Link href="/beta" className="inline-flex items-center gap-2 bg-blue-900 px-5 py-3 text-base font-bold text-white hover:bg-blue-800">
              Make my free video <ArrowRight size={16} />
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">Sent to {shownFor.email} too.</p>
        </>
      ) : (
        <form onSubmit={submit} noValidate={false}>
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#BA7517] mb-1.5">Try it free</p>
          <h2 className="text-2xl sm:text-[26px] font-black leading-tight text-slate-900 mb-1.5">What buyers in your area ask AI</h2>
          <p className="text-base leading-relaxed text-slate-500 mb-4">
            Answer these on video and you show up when buyers ask ChatGPT, Google or Siri.
          </p>
          {busy ? (
            <ul className="space-y-2 py-2" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 text-[15px] ${i <= step ? "text-slate-700" : "text-slate-300"}`}>
                  {i < step ? <Check size={16} className="text-emerald-600" /> : i === step ? <Loader2 size={16} className="animate-spin text-blue-900" /> : <span className="w-4" />}
                  {i === 0 ? `Looking up ${city.trim() || "your town"}` : s}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-800">Your name</span>
                  <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" required minLength={2} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-800">Email</span>
                  <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
                </label>
              </div>
              <label className="block mb-3">
                <span className="mb-1 block text-sm font-bold text-slate-800">Your city or town</span>
                <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Maplewood, NJ" autoComplete="address-level2" required minLength={2} />
              </label>
              {/* Hidden from people; bots fill it in. */}
              <input type="text" name="company" value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-3.5 text-lg font-bold text-white hover:bg-blue-800">
                Show me the questions <ArrowRight size={18} />
              </button>
              {error && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{error}</p>}
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                We&apos;ll email you the questions too. By continuing you agree that SparkReels may contact you
                about your results. No spam; unsubscribe anytime.{" "}
                <Link href="/privacy" className="underline">Privacy</Link>
              </p>
            </>
          )}
        </form>
      )}
    </div>
  );
}
