"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mic, Send, Square, X } from "lucide-react";
import toast from "react-hot-toast";
import { useSpeechRecognition, COMMAND_SILENCE_MS } from "@/lib/hooks/use-speech-recognition";

/**
 * Ask Sparklee's goal card at the top of Home (2026-10-29, the owner's agentic
 * Home; redesigned 2026-10-31 from her mockup): a cream conversation card with
 * a thin dark header strip. Speak or type a goal and her answer appears right
 * under the box: what you said, her plan as numbered cards, what it uses from
 * your plan, then Approve plan / Edit plan / Start over. Approving writes
 * drafts only; nothing is made, posted or sent until each is approved in
 * Needs Your Approval.
 */

interface PlanItem {
  type: "video" | "tool"; title: string; topic?: string; day?: string;
  size?: "vertical" | "horizontal"; platforms?: string[]; note?: string; tool?: string; href?: string;
}
interface Plan {
  reply: string; question?: string; items: PlanItem[]; videos: number;
  usageLine: string; overBudget: boolean; missing: { label: string; href: string }[]; paid: boolean;
}

/** Four examples, kept on one line (the owner's ask, 2026-10-31). */
export const TRY_SAYING = ["Plan my week", "Market my listing", "Create a market update", "What should I post this week?"];
const DAYS = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const LABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads", google_business: "Google Business" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line of the conversation on the card (2026-10-31, the owner's ask: read in order). */
type Turn =
  | { role: "you"; text: string; voice: boolean }
  | { role: "sparklee"; text: string; question?: boolean; titles?: string[] };

/** Sparklee's side of the conversation: her badge and a soft gold card. */
function FromSparklee({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="sparklee-badge block h-[34px] w-[34px] shrink-0">
        <Image src="/sparklee.webp" alt="" width={34} height={34} className="h-full w-full" unoptimized />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#f0dcb4] bg-[#fbf3e4] px-3.5 py-3">{children}</div>
    </div>
  );
}

export function SparkleeGoal({ ask, onApproved }: {
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
  /** The conversation so far; the latest plan (if any) is `plan`, shown after it. */
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(words: string, voice = false, fresh = false) {
    const said = words.trim();
    if (!said) { inputRef.current?.focus(); return; }
    // The plan on screen becomes part of the conversation, so a reply like
    // "make it two videos" or "123 Main St" keeps what it answers.
    const before: Turn[] = fresh ? [] : [...turns, ...(plan ? [{ role: "sparklee" as const, text: plan.reply, titles: plan.items.map((i) => i.title) }] : [])];
    const next: Turn[] = [...before, { role: "you", text: said, voice }];
    setTurns(next); setText("");
    setPlanning(true); setPlan(null); setDone(null); setEditing(false);
    const history = before.slice(-8).map((t) => t.role === "you"
      ? { role: "user", content: t.text }
      : { role: "assistant", content: [t.text, ...(t.titles ?? [])].join("\n") });
    try {
      const res = await fetch("/api/sparklee/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: said, history }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Sparklee couldn't plan that. Try again."); setTurns(before); setText(said); return; }
      const p = out as Plan;
      if (p.question) setTurns([...next, { role: "sparklee", text: p.question, question: true }]);
      else setPlan(p);
    } finally { setPlanning(false); }
  }

  const { listening, interim, toggle } = useSpeechRecognition({
    silenceMs: COMMAND_SILENCE_MS,
    onSessionEnd: (said) => { if (said.trim()) void send(said, true); },
    onUnsupported: () => toast("This browser can't listen. Type it instead.", { icon: "⌨️" }),
  });

  const askN = ask?.n;
  useEffect(() => { if (ask?.text) void send(ask.text, false, true); }, [askN]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve() {
    if (!plan) return;
    const videos = plan.items.filter((i) => i.type === "video");
    if (!videos.length) { startOver(); return; }
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

  function startOver() {
    setPlan(null); setDone(null); setTurns([]); setText(""); setEditing(false);
    inputRef.current?.focus();
  }

  const removeItem = (n: number) => setPlan((p) => p && { ...p, items: p.items.filter((_, i) => i !== n), videos: p.items.filter((x, i) => i !== n && x.type === "video").length });
  const setDay = (n: number, day: string) => setPlan((p) => p && { ...p, items: p.items.map((x, i) => (i === n ? { ...x, day } : x)) });

  const answered = planning || plan !== null || turns.length > 0;
  const last = turns[turns.length - 1];
  const showing = listening ? interim : text;

  return (
    <section className="mt-3 overflow-hidden rounded-[20px] border border-spark-rule bg-[#fffcf6] shadow-[0_6px_24px_rgba(36,34,30,0.06)]">
      {/* Thin dark header strip: Sparklee's black and gold as an accent. */}
      <div className="flex items-center gap-2.5 bg-[#0f0d0b] px-5 py-2">
        <span className="sparklee-badge block h-[32px] w-[32px] shrink-0">
          <Image src="/sparklee.webp" alt="" width={32} height={32} className="h-full w-full" unoptimized />
        </span>
        <b className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#ffe39a]">Ask Sparklee</b>
      </div>

      <div className="p-4 sm:p-5">
        <h2 className="mb-3 text-[22px] font-bold leading-tight text-spark-ink sm:text-[24px]">What do you want to accomplish?</h2>

        <form
          onSubmit={(e) => { e.preventDefault(); void send(text); }}
          className={`flex items-center gap-2.5 rounded-2xl border-2 bg-white p-2 ${listening ? "border-[#e7a92c] shadow-[0_0_0_4px_#fbeacc]" : "border-spark-rule"}`}
        >
          <button type="button" onClick={toggle} aria-label={listening ? "Stop listening" : "Speak to Sparklee"}
            className={`flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full text-white ${listening ? "animate-pulse bg-[#c2410c]" : "spark-cta-gradient"}`}>
            {listening ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
          </button>
          <input
            ref={inputRef}
            value={showing}
            onChange={(e) => setText(e.target.value)}
            readOnly={listening}
            placeholder={listening ? "Listening…" : answered ? "Reply to Sparklee or ask something new…" : "Speak or type your goal…"}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-spark-ink outline-none placeholder:text-[#a29d92]"
          />
          <button type="submit" disabled={planning || listening}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-spark-amber px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-60">
            {planning ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        {/* Examples: one line; scrolls sideways only on a narrow phone. */}
        {!answered && !listening && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {TRY_SAYING.map((t) => (
              <button key={t} type="button" onClick={() => void send(t)}
                className="shrink-0 whitespace-nowrap rounded-full border border-spark-rule bg-white px-4 py-2 text-[15px] font-medium text-spark-ink hover:border-spark-amber">{t}</button>
            ))}
          </div>
        )}

        {listening && (
          <p className="mt-4 flex items-center gap-2 border-t border-spark-rule pt-3.5 text-[15px] text-spark-ink">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => <i key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-spark-amber" style={{ animationDelay: `${d}ms` }} />)}
            </span>
            <b>Listening…</b> <span className="text-spark-ink-muted">tap ■ when you&apos;re done</span>
          </p>
        )}

        {!answered && !listening && (
          <p className="mt-3.5 rounded-2xl border-[1.5px] border-dashed border-spark-rule px-4 py-3.5 text-center text-[14.5px] text-[#a29d92]">
            ✨ Sparklee&apos;s recommendation appears here after you ask.
          </p>
        )}

        {/* The conversation, in order, right under the box (2026-10-31). */}
        {answered && !listening && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-spark-rule pt-4">
            {turns.map((t, i) => t.role === "you" ? (
              <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-[#2a2219] px-3.5 py-2.5 text-[15px] text-white">
                <span className="block text-[11px] font-extrabold uppercase tracking-wide text-[#cdbf9f]">{t.voice ? "I heard" : "You said"}</span>
                &ldquo;{t.text}&rdquo;
              </div>
            ) : (
              <FromSparklee key={i}>
                <p className="text-[13px] font-extrabold text-[#A3660F]">Sparklee</p>
                <p className="mt-0.5 text-[15.5px] text-spark-ink">{t.question ? <>&ldquo;{t.text}&rdquo;</> : t.text}</p>
                {!!t.titles?.length && (
                  <ol className="mt-1 list-decimal pl-5 text-[13.5px] text-spark-ink-muted">{t.titles.map((x, n) => <li key={n}>{x}</li>)}</ol>
                )}
                {t.question && t === last && !planning && (
                  <p className="mt-1 text-[12px] text-[#a29d92]">Reply above, or say it out loud.</p>
                )}
              </FromSparklee>
            ))}

            {planning && (
              <FromSparklee>
                <p className="flex items-center gap-2 text-[15px] text-spark-ink"><Loader2 size={15} className="animate-spin text-spark-amber" /> Building your plan…</p>
              </FromSparklee>
            )}

            {plan && (
              <FromSparklee>
                {done !== null ? (
                  <div className="text-[15px] text-spark-ink">
                    <p className="flex items-center gap-1.5 font-semibold text-[#0f7a52]"><Check size={16} /> Plan approved.</p>
                    <p className="mt-1">{done} draft{done === 1 ? " is" : "s are"} being written. {done === 1 ? "It" : "They"}&apos;ll show in <b>Needs Your Approval</b>. No video is made and nothing posts until you approve.</p>
                    <button type="button" onClick={startOver} className="mt-2.5 rounded-xl border border-spark-rule bg-white px-3.5 py-2 text-[14px] font-semibold text-spark-ink hover:border-spark-amber">Ask something else</button>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-extrabold text-[#A3660F]">Sparklee recommends</p>
                    <p className="mb-2.5 mt-0.5 text-[15.5px] text-spark-ink">{plan.reply}</p>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {plan.items.map((it, n) => (
                        <div key={n} className="relative rounded-2xl border border-spark-rule bg-white p-3">
                          {editing && (
                            <button type="button" onClick={() => removeItem(n)} aria-label="Remove"
                              className="absolute right-2 top-2 rounded p-0.5 text-spark-ink-muted hover:text-spark-ink"><X size={15} /></button>
                          )}
                          <span className="mb-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-spark-amber text-[13px] font-extrabold text-white">{n + 1}</span>
                          <b className="block text-[15px] text-spark-ink">{it.title}</b>
                          <span className="mt-1 block text-[13px] text-spark-ink-muted">
                            {it.type === "video"
                              ? [it.day && cap(it.day), it.size === "horizontal" ? "Wide" : "Vertical", it.platforms?.length ? it.platforms.map((p) => LABEL[p] ?? p).join(", ") : "No account picked yet", it.note].filter(Boolean).join(" · ")
                              : <>{it.note ? `${it.note} · ` : ""}<Link href={it.href ?? "/create"} className="font-semibold text-[#A3660F] underline">Open</Link> (you finish this one)</>}
                          </span>
                          {editing && it.type === "video" && (
                            <select value={DAYS.includes((it.day ?? "").toLowerCase()) ? it.day!.toLowerCase() : "tomorrow"} onChange={(e) => setDay(n, e.target.value)}
                              className="mt-1.5 rounded-md border border-spark-rule bg-white px-2 py-0.5 text-[13px] text-spark-ink">
                              {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                    {plan.missing.map((m) => (
                      <Link key={m.label} href={m.href} className="mt-2 block text-[13.5px] font-semibold text-[#A3660F] underline">{m.label}</Link>
                    ))}
                    <p className={`mt-2.5 rounded-xl px-3 py-2 text-[14px] ${plan.overBudget ? "bg-red-50 text-red-700" : "bg-white text-spark-ink"}`}>
                      {plan.usageLine}{plan.overBudget && " Remove one, or buy more in Billing."}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void approve()} disabled={approving || plan.overBudget || plan.items.length === 0}
                        className="flex items-center gap-1.5 rounded-xl bg-spark-amber px-4 py-2 text-[14.5px] font-bold text-white disabled:opacity-50">
                        {approving && <Loader2 size={14} className="animate-spin" />} Approve plan
                      </button>
                      <button type="button" onClick={() => setEditing((v) => !v)}
                        className="rounded-xl border border-spark-rule bg-white px-4 py-2 text-[14.5px] font-semibold text-spark-ink hover:border-spark-amber">
                        {editing ? "Done editing" : "Edit plan"}
                      </button>
                      <button type="button" onClick={startOver}
                        className="rounded-xl border border-spark-rule bg-white px-4 py-2 text-[14.5px] font-semibold text-spark-ink hover:border-spark-amber">
                        Start over
                      </button>
                    </div>
                  </>
                )}
              </FromSparklee>
            )}
          </div>
        )}

        <p className="mt-3.5 text-[14px] text-spark-ink-muted">
          Prefer to build it yourself? <Link href="/create" className="font-bold text-[#A3660F] hover:underline">Open Spark Studio →</Link>
        </p>
      </div>
    </section>
  );
}
