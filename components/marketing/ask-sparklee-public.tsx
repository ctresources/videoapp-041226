"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Loader2, Mic, Send, X } from "lucide-react";
import s from "./ask-sparklee-public.module.css";

/**
 * Ask Sparklee on the public website (2026-10-26, the owner's approved
 * mockup): a button in the bottom right of every website page, opening a small
 * chat that answers from the website's own pages (/api/public/sparklee). Four
 * questions a day per visitor; then it points to signing up. The mic uses the
 * browser's own speech recognition, where there is one.
 */

const CHIPS = ["Is the first video free?", "What does it cost?", "Do I need to be on camera?", "Where does it post?"];
const LIMIT = 4;

type Msg = { from: "me" | "bot"; text: string };

// The browser's speech recognition, which TypeScript does not describe.
type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function AskSparkleePublic() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Hi! I'm Sparklee. Ask me anything about SparkReels, out loud or by typing." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(LIMIT);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => { setCanSpeak(!!makeRecognition()); }, []);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy || left <= 0) return;
    setText("");
    setMsgs((m) => [...m, { from: "me", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/public/sparklee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, page: window.location.pathname }),
      });
      const d = (await res.json().catch(() => ({}))) as { answer?: string; error?: string; left?: number };
      if (typeof d.left === "number") setLeft(d.left);
      setMsgs((m) => [...m, { from: "bot", text: d.answer ?? d.error ?? "Sparklee couldn't answer just now. Please try again." }]);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "Sparklee couldn't answer just now. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    if (listening) { rec.current?.stop(); return; }
    const r = makeRecognition();
    if (!r) return;
    rec.current = r;
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said) void ask(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  }

  const done = left <= 0;

  return (
    <>
      {open && (
        <div className="fixed right-4 bottom-[84px] z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_60px_-20px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-900 to-[#2c4fb5] px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#fff3dc] p-0.5">
              <Image src="/sparklee-face.webp" alt="" width={30} height={30} className="h-full w-full" unoptimized />
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold">Ask Sparklee</p>
              <p className="text-xs opacity-80">Questions about SparkReels</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-white/15 hover:bg-white/25">
              <X size={16} />
            </button>
          </div>

          <div ref={body} className="flex max-h-[320px] flex-col gap-2.5 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.from === "me" ? "self-end rounded-tr-sm bg-blue-900 text-white" : "self-start rounded-tl-sm bg-slate-100 text-slate-800"}`}>
                {m.text}
              </div>
            ))}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-1.5">
                {CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => void ask(c)} className="rounded-full border border-[#c9d5f3] bg-[#eef3ff] px-2.5 py-1.5 text-[13px] font-semibold text-blue-900 hover:bg-[#e2eaff]">
                    {c}
                  </button>
                ))}
              </div>
            )}
            {busy && (
              <div className="self-start rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500">
                <Loader2 size={14} className="inline animate-spin" />
              </div>
            )}
          </div>

          {done ? (
            <p className="border-t border-slate-200 px-4 py-3 text-[13px] text-slate-600">
              That&apos;s your {LIMIT} questions for today. Create your first Spark free to keep going.
            </p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="flex gap-2 border-t border-slate-200 px-4 py-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                placeholder={listening ? "Listening…" : "Type a question…"}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
              />
              {canSpeak && (
                <button type="button" onClick={listen} aria-label={listening ? "Stop" : "Speak"} className={`grid w-10 place-items-center rounded-xl text-white ${listening ? "bg-red-500" : "bg-amber-600 hover:bg-amber-700"}`}>
                  <Mic size={17} />
                </button>
              )}
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="grid w-10 place-items-center rounded-xl bg-blue-900 text-white disabled:opacity-40">
                <Send size={16} />
              </button>
            </form>
          )}
          <a href="/beta" className="mx-4 mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-blue-900 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
            Create Your First Spark <ArrowRight size={15} />
          </a>
          <p className="px-4 pb-3 text-[11px] text-slate-400">
            Answers come from SparkReels&apos; own pages. {done ? "" : `${left} of ${LIMIT} questions left today.`}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-4 z-[60] flex items-center gap-2.5 rounded-full bg-blue-900 py-2 pl-2 pr-4 text-base font-bold text-white shadow-[0_14px_30px_-12px_rgba(30,58,138,0.7)] hover:bg-blue-800"
      >
        <span className={`grid h-10 w-10 place-items-center rounded-full bg-[#fff3dc] ${s.glow}`}>
          <Image src="/sparklee-face.webp" alt="" width={32} height={32} className="h-8 w-8" unoptimized />
        </span>
        Ask Sparklee
      </button>
    </>
  );
}
