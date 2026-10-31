"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mic, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { useSpeechRecognition, COMMAND_SILENCE_MS } from "@/lib/hooks/use-speech-recognition";

/**
 * Ask Sparklee's goal box (2026-10-29, the owner's agentic Home): speak or
 * type what you want, see her plan with what it uses from your plan, then
 * Approve plan or Edit plan. Approving writes drafts only; nothing is made,
 * posted or sent until each is approved in Needs Your Approval.
 *
 * "hero" sits at the top of Home; "compact" is the header mic's pop-over.
 */

interface PlanItem {
  type: "video" | "tool"; title: string; topic?: string; day?: string;
  size?: "vertical" | "horizontal"; platforms?: string[]; note?: string; tool?: string; href?: string;
}
interface Plan {
  reply: string; question?: string; items: PlanItem[]; videos: number;
  usageLine: string; overBudget: boolean; missing: { label: string; href: string }[]; paid: boolean;
}

export const TRY_SAYING = ["Plan my week", "Market my listing", "Create a market update", "Turn my blog into a video", "What should I post this week?"];
const DAYS = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const LABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads", google_business: "Google Business" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SparkleeGoal({ variant = "hero", ask, onApproved }: {
  variant?: "hero" | "compact";
  /** Set from outside (an opportunity's Make draft): asked straight away. */
  ask?: { text: string; n: number } | null;
  onApproved?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  /** What was asked, shown above Sparklee's answer (2026-10-30, the owner's ask). */
  const [asked, setAsked] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(words: string) {
    const said = words.trim();
    if (!said) { inputRef.current?.focus(); return; }
    setText(said); setAsked(said); setPlanning(true); setPlan(null); setDone(null); setEditing(false);
    try {
      const res = await fetch("/api/sparklee/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: said }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Sparklee couldn't plan that. Try again."); return; }
      setPlan(out as Plan);
      setText("");
    } finally { setPlanning(false); }
  }

  const { listening, interim, toggle } = useSpeechRecognition({
    silenceMs: COMMAND_SILENCE_MS,
    onSessionEnd: (said) => { if (said.trim()) void send(said); },
    onUnsupported: () => toast("This browser can't listen. Type it instead.", { icon: "⌨️" }),
  });

  const askN = ask?.n;
  useEffect(() => { if (ask?.text) void send(ask.text); }, [askN]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve() {
    if (!plan) return;
    const videos = plan.items.filter((i) => i.type === "video");
    if (!videos.length) { setPlan(null); setText(""); return; }
    setApproving(true);
    try {
      const res = await fetch("/api/sparklee/plan/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: videos }) });
      const out = await res.json().catch(() => ({}));
      if (out.fill) { router.push(out.fill); return; }
      if (!res.ok) { toast.error(out.error || "Couldn't start that. Try again."); return; }
      setDone(out.drafts ?? videos.length);
      setEditing(false);
      onApproved?.();
    } finally { setApproving(false); }
  }

  const removeItem = (n: number) => setPlan((p) => p && { ...p, items: p.items.filter((_, i) => i !== n), videos: p.items.filter((x, i) => i !== n && x.type === "video").length });
  const setDay = (n: number, day: string) => setPlan((p) => p && { ...p, items: p.items.map((x, i) => (i === n ? { ...x, day } : x)) });

  const hero = variant === "hero";
  const showing = listening ? interim || "Listening…" : text;

  return (
    <div className={hero && (planning || plan || done !== null) ? "grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" : "flex flex-col gap-3"}>
      <div className="min-w-0">
        {hero && (
          <div className="mb-3 flex items-center gap-3">
            <span className="sparklee-badge block h-[54px] w-[54px] shrink-0">
              <Image src="/sparklee.webp" alt="" width={54} height={54} className="h-full w-full" unoptimized />
            </span>
            <div>
              <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#e7a92c]">Ask Sparklee</p>
              <h2 className="text-[24px] font-bold leading-tight text-white sm:text-[27px]">What do you want to accomplish?</h2>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(text); }}
          className={`flex items-center gap-2 rounded-2xl border bg-[#1d1915] p-2 ${listening ? "border-[#e7a92c]" : "border-[#5a4826]"}`}
        >
          <button type="button" onClick={toggle} aria-label={listening ? "Stop listening" : "Speak to Sparklee"}
            className={`flex shrink-0 items-center justify-center rounded-full text-white ${hero ? "h-[56px] w-[56px]" : "h-[44px] w-[44px]"} ${listening ? "animate-pulse bg-red-600" : "spark-cta-gradient shadow-[0_0_0_6px_rgba(186,117,23,0.18)]"}`}>
            <Mic size={hero ? 24 : 19} />
          </button>
          <input
            ref={inputRef}
            value={showing}
            onChange={(e) => setText(e.target.value)}
            readOnly={listening}
            placeholder="Speak or type what you want Sparklee to do…"
            className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-[#9c8f78] outline-none ${hero ? "text-[17px]" : "text-[15px]"}`}
          />
          <button type="submit" disabled={planning || listening}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-spark-amber px-3.5 py-2 text-[14px] font-bold text-white disabled:opacity-60">
            {planning ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <p className="mt-3 text-[13.5px] text-[#cdbf9f]">Try saying:</p>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TRY_SAYING.slice(0, hero ? 5 : 4).map((t) => (
            <button key={t} type="button" onClick={() => void send(t)}
              className="shrink-0 whitespace-nowrap rounded-full border border-[#5a4826] bg-[#1d1915] px-4 py-2 text-[15.5px] font-medium text-[#f3e6cf] hover:border-[#e7a92c]">{t}</button>
          ))}
        </div>
        {hero && (
          <p className="mt-3 text-[13.5px] text-[#cdbf9f]">
            Open <Link href="/create" className="font-semibold text-[#ffe39a] underline-offset-2 hover:underline">Spark Studio</Link> when you want control. <b className="text-[#ffe39a]">Ask Sparklee</b> when you just want it done.
          </p>
        )}
      </div>

      {(planning || plan || done !== null) && (
        <div className="flex min-w-0 flex-col rounded-2xl border border-[#3b3226] bg-[#1d1915] p-3.5 text-[#f3e6cf]">
          {asked && (
            <div className="mb-3 self-end rounded-2xl rounded-br-sm bg-[#2a2219] px-3 py-2 text-[14px] text-white">
              <span className="block text-[11.5px] font-bold uppercase tracking-wide text-[#cdbf9f]">You asked</span>
              {asked}
            </div>
          )}
          <p className="mb-1.5 text-[13px] font-bold text-[#ffe39a]">✦ Sparklee</p>
          {planning && <p className="flex items-center gap-2 text-[14px]"><Loader2 size={15} className="animate-spin" /> Checking your plan, accounts and calendar…</p>}

          {done !== null && (
            <div className="text-[14px]">
              <p className="flex items-center gap-1.5 font-semibold text-[#9fe0bf]"><Check size={15} /> Plan approved.</p>
              <p className="mt-1">{done} draft{done === 1 ? " is" : "s are"} being written. {done === 1 ? "It" : "They"}&apos;ll show in <b>Needs Your Approval</b>. No video is made and nothing posts until you approve.</p>
              <button type="button" onClick={() => { setDone(null); setPlan(null); setText(""); }} className="mt-2 text-[13px] font-semibold text-[#ffe39a] underline">Ask something else</button>
            </div>
          )}

          {plan && done === null && (
            <>
              {plan.question ? (
                <p className="text-[14.5px]">{plan.question}</p>
              ) : (
                <>
                  <p className="text-[14px]">{plan.reply}</p>
                  <ol className="mt-2 space-y-1.5 pl-5 text-[14px]">
                    {plan.items.map((it, n) => (
                      <li key={n} className="list-decimal">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <b>{it.title}</b>
                            <span className="block text-[12.5px] text-[#cdbf9f]">
                              {it.type === "video"
                                ? [it.day && cap(it.day), it.size === "horizontal" ? "Wide" : "Vertical", it.platforms?.length ? it.platforms.map((p) => LABEL[p] ?? p).join(", ") : "No account picked yet", it.note].filter(Boolean).join(" · ")
                                : <>{it.note ? `${it.note} · ` : ""}<Link href={it.href ?? "/create"} className="text-[#ffe39a] underline">Open</Link> (you finish this one)</>}
                            </span>
                            {editing && it.type === "video" && (
                              <select value={DAYS.includes((it.day ?? "").toLowerCase()) ? it.day!.toLowerCase() : "tomorrow"} onChange={(e) => setDay(n, e.target.value)}
                                className="mt-1 rounded-md border border-[#5a4826] bg-[#0f0d0b] px-2 py-0.5 text-[12.5px]">
                                {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                              </select>
                            )}
                          </div>
                          {editing && (
                            <button type="button" onClick={() => removeItem(n)} aria-label="Remove" className="rounded p-0.5 text-[#cdbf9f] hover:text-white"><X size={14} /></button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {plan.missing.map((m) => (
                    <Link key={m.label} href={m.href} className="mt-2 block text-[13px] text-[#ffe39a] underline">{m.label}</Link>
                  ))}
                  <p className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] ${plan.overBudget ? "bg-red-900/40 text-red-100" : "bg-[#2a2219]"}`}>
                    {plan.usageLine}{plan.overBudget && " Remove one, or buy more in Billing."}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <button type="button" onClick={() => void approve()} disabled={approving || plan.overBudget || plan.items.length === 0}
                      className="flex items-center gap-1.5 rounded-xl bg-spark-amber px-3.5 py-2 text-[14px] font-bold text-white disabled:opacity-50">
                      {approving && <Loader2 size={14} className="animate-spin" />} Approve plan
                    </button>
                    <button type="button" onClick={() => setEditing((v) => !v)}
                      className="rounded-xl border border-[#5a4826] px-3.5 py-2 text-[14px] font-semibold text-[#f3e6cf]">
                      {editing ? "Done editing" : "Edit plan"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
