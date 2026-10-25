"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Mic, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { micErrorMessage } from "@/lib/hooks/use-microphone";

/**
 * Ask Sparklee: a spoken helper on every page (2026-10-14, the owner's plan
 * and name). Tap, ask out loud how to do something, hear a short answer from
 * the How It Works guide.
 *
 * The server hands out a one-time pass (/api/help/ask); the voice then goes
 * straight between this browser and OpenAI's realtime service over WebRTC,
 * which is what makes the answer come back in about a second. Sparklee only
 * talks: it cannot see or press anything on the page.
 */

/** Sent by anything else on the page that starts Sparklee (the card above
 *  the topic on Create), so there is still only the one conversation. */
export const ASK_SPARKLEE_EVENT = "sparklee:ask";

type Line = { id: string; who: "you" | "sparklee"; text: string };
type Status = "idle" | "connecting" | "live" | "error";

export function AskSparklee() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef<number>(0);
  /** The last time anyone spoke or Sparklee answered; quiet for 30s ends it. */
  const activeAtRef = useRef<number>(0);
  /** Whether Sparklee is talking (2026-10-15). Her answer arrives faster than
   *  she says it, so the events alone stop well before her voice does: the
   *  quiet rule hung up on her, and the time limit cut her off mid-sentence.
   *  Two signals, either one enough: the service's own "audio started /
   *  stopped" events, and the sound level of her voice in this browser. */
  const speakingRef = useRef(false);
  const audioEventsRef = useRef(false);
  const heardAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // One shake each time a page opens, which covers landing on Create after
  // logging in (2026-10-15, the owner's ask). The glow and shine run then and
  // every 2 minutes after (globals.css).
  const pathname = usePathname();
  const [buzz, setBuzz] = useState(false);
  useEffect(() => {
    setBuzz(false);
    const id = requestAnimationFrame(() => setBuzz(true));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const startRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onAsk = () => startRef.current();
    window.addEventListener(ASK_SPARKLEE_EVENT, onAsk);
    return () => window.removeEventListener(ASK_SPARKLEE_EVENT, onAsk);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  /** Adds to Sparklee's line for this response, or starts one. */
  function sparkleeSays(id: string, delta: string, done = false) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i === -1) return [...prev, { id, who: "sparklee", text: delta }];
      const next = [...prev];
      next[i] = { ...next[i], text: done ? delta || next[i].text : next[i].text + delta };
      return next;
    });
  }

  function onEvent(raw: string) {
    let e: Record<string, unknown>;
    try { e = JSON.parse(raw); } catch { return; }
    const type = String(e.type || "");
    const id = String(e.response_id || e.item_id || "r");
    if (type === "input_audio_buffer.speech_started" || type.startsWith("response.")) activeAtRef.current = Date.now();
    if (type === "response.created" || type === "output_audio_buffer.started") speakingRef.current = true;
    if (type.startsWith("output_audio_buffer.")) audioEventsRef.current = true;
    if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared"
      || (type === "response.done" && !audioEventsRef.current)) {
      speakingRef.current = false;
      activeAtRef.current = Date.now();
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const text = String(e.transcript || "").trim();
      if (text) setLines((prev) => [...prev, { id: `you-${String(e.item_id || prev.length)}`, who: "you", text }]);
    } else if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
      sparkleeSays(id, String(e.delta || ""));
    } else if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      sparkleeSays(id, String(e.transcript || ""), true);
    } else if (type === "error") {
      console.warn("[ask-sparklee]", e);
    }
  }

  /** True while Sparklee is still saying something. */
  function talking() {
    return speakingRef.current || Date.now() - heardAtRef.current < 1500;
  }

  async function start() {
    // Made inside the tap, or iPhone keeps it silent. Only listens to her
    // voice; the audio element is what plays it.
    try {
      const Ctx = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) { audioCtxRef.current = new Ctx(); void audioCtxRef.current.resume(); }
    } catch { /* the events still tell when she talks */ }
    speakingRef.current = false;
    audioEventsRef.current = false;
    heardAtRef.current = 0;
    setOpen(true);
    setError(null);
    setNote(null);
    setLines([]);
    setStatus("connecting");
    try {
      const res = await fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname }),
      });
      const pass = await res.json().catch(() => ({}));
      if (!res.ok || !pass.secret) throw new Error(pass.error || "Sparklee isn't available right now.");

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (err) {
        throw new Error(micErrorMessage(err));
      }
      micRef.current = mic;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (ev) => {
        audio.srcObject = ev.streams[0];
        const ctx = audioCtxRef.current;
        if (!ctx || levelTimerRef.current) return;
        try {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          ctx.createMediaStreamSource(ev.streams[0]).connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          levelTimerRef.current = setInterval(() => {
            analyser.getByteTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
            if (peak > 8) heardAtRef.current = Date.now();
          }, 200);
        } catch { /* the events still tell when she talks */ }
      };
      mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (ev) => onEvent(String(ev.data));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setError("The connection dropped. Tap Ask Sparklee to try again.");
          end("error");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${pass.secret}`, "Content-Type": "application/sdp" },
      });
      if (!answer.ok) throw new Error("Sparklee couldn't connect. Try again in a moment.");
      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });

      startedRef.current = Date.now();
      activeAtRef.current = Date.now();
      const max = Number(pass.maxSeconds) || 300;
      setLeft(max);
      timerRef.current = setInterval(() => {
        const remaining = max - Math.floor((Date.now() - startedRef.current) / 1000);
        setLeft(Math.max(0, remaining));
        // Her talking counts as activity, so the quiet rule never hangs up on her.
        if (talking()) activeAtRef.current = Date.now();
        // At the limit she finishes what she is saying (up to 45 seconds more)
        // and then it ends.
        if (remaining <= 0) {
          if (talking() && remaining > -45) return;
          setNote("Five minutes is the limit for one conversation.");
          end("idle");
        }
        // Nobody has spoken for 30 seconds: hang up rather than keep paying
        // for a quiet room.
        else if (Date.now() - activeAtRef.current > 30_000) { setNote("Stopped after 30 seconds of quiet."); end("idle"); }
      }, 1000);
      setStatus("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sparklee isn't available right now.");
      end("error");
    }
  }

  /** Hangs up, and reports how long it ran. */
  function end(next: Status = "idle") {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
    try { void audioCtxRef.current?.close(); } catch { /* already closed */ }
    audioCtxRef.current = null;
    speakingRef.current = false;
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch { /* closing anyway */ }
    try { pcRef.current?.close(); } catch { /* already closed */ }
    pcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; audioRef.current = null; }
    if (startedRef.current) {
      const seconds = Math.round((Date.now() - startedRef.current) / 1000);
      startedRef.current = 0;
      void fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", seconds }),
        keepalive: true,
      }).catch(() => {});
    }
    setLeft(null);
    setStatus(next);
  }

  function close() {
    end();
    setOpen(false);
    setError(null);
    setNote(null);
    setLines([]);
  }

  const live = status === "live";
  const busy = live || status === "connecting";
  // The card above the topic asks through here. A second tap while she is
  // already on does nothing rather than starting over.
  startRef.current = () => { if (!busy) void start(); };

  return (
    <>
      {/* Sparklee herself in place of the words (2026-10-15, the owner's
          mock). While she listens, her face sits beside a red Stop. */}
      {busy ? (
        <span className="flex items-center gap-2">
          <span className="sparklee-badge sparklee-live block h-[30px] w-[30px] shrink-0">
            <Image src="/sparklee-face.webp" alt="" width={30} height={30} className="h-full w-full" unoptimized />
          </span>
          <button
            type="button"
            onClick={() => end()}
            aria-label="Stop Ask Sparklee"
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700"
          >
            {status === "connecting" && <Loader2 size={14} className="animate-spin" />}
            Stop
          </button>
        </span>
      ) : (
        // Her box in the top bar, in place of the round badge (2026-10-18,
        // the owner's mockup): moved up from beside Create's steps. Computers
        // only; on a phone she is the first item in the menu (sidebar.tsx),
        // and this component stays mounted for the conversation itself.
        <button
          // A new element per page, so her 2-minute glow cycle starts over.
          key={pathname}
          type="button"
          onClick={() => void start()}
          aria-label="Ask Sparklee"
          // Every width since 2026-10-24: it sits under the bar now, with room.
          className="flex shrink-0 items-center gap-2 rounded-xl border border-[#3a3226] bg-[#0f0d0b] py-1 pl-1 pr-3 text-left transition-opacity hover:opacity-90"
        >
          <span
            onAnimationEnd={(e) => { if (e.animationName === "sparklee-buzz") setBuzz(false); }}
            className={cn("sparklee-badge block h-[34px] w-[34px] shrink-0", buzz && "sparklee-buzz")}
          >
            <Image src="/sparklee.webp" alt="" width={34} height={34} className="h-full w-full" unoptimized priority />
          </span>
          <span className="leading-tight">
            <span className="block bg-gradient-to-b from-[#ffe39a] via-[#e7a92c] to-[#b9780f] bg-clip-text font-display text-[14.5px] font-bold text-transparent">
              Ask Sparklee
            </span>
            <span className="hidden whitespace-nowrap text-[11px] text-[#f3e6cf] sm:block">Need help on a section? Just ask her.</span>
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Ask Sparklee"
          // Top right, just under the bar (2026-10-14). At the bottom it sat
          // behind Create's footer, which hid half the words and the Stop.
          // Below the button's row under the bar (2026-10-24).
          className="fixed right-4 top-[104px] z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-spark-rule bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-spark-rule px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[14px] font-bold text-spark-ink">
              <Sparkles size={15} className="text-[#A3660F]" /> Sparklee
            </p>
            <div className="flex items-center gap-2">
              {live && (
                <span className="flex items-center gap-1 text-[12px] font-medium text-green-700">
                  <Mic size={12} /> Listening{left !== null && left <= 30 ? ` · ${left}s` : ""}
                </span>
              )}
              {/* Stop where it can't be missed, beside the listening light. */}
              {(live || status === "connecting") && (
                <button
                  type="button"
                  onClick={() => end()}
                  className="rounded-lg bg-red-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-red-700"
                >
                  Stop
                </button>
              )}
              <button type="button" onClick={close} aria-label="Close" className="rounded p-1 text-spark-ink-muted hover:text-spark-ink">
                <X size={15} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex max-h-[55vh] min-h-[90px] flex-col gap-2 overflow-y-auto px-4 py-3">
            {status === "connecting" && <p className="text-[13.5px] text-spark-ink-muted">Connecting…</p>}
            {live && lines.length === 0 && (
              <p className="text-[13.5px] text-spark-ink-muted">Ask out loud how to do something on this page.</p>
            )}
            {lines.map((l) => (
              <p
                key={l.id}
                className={cn(
                  "rounded-xl px-3 py-2 text-[13.5px] leading-[1.45]",
                  l.who === "you" ? "self-end bg-spark-paper text-spark-ink-soft" : "self-start bg-spark-amber-tint text-spark-ink",
                )}
              >
                {l.text}
              </p>
            ))}
            {error && <p className="text-[13.5px] text-red-700">{error}</p>}
            {note && !error && <p className="text-[12.5px] text-spark-ink-muted">{note}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-spark-rule px-4 py-2.5">
            <Link href="/help" className="text-[12.5px] font-semibold text-spark-ink-muted hover:text-spark-amber">
              How It Works
            </Link>
            {live ? (
              <button type="button" onClick={() => end()} className="rounded-lg bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-red-700">
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={status === "connecting"}
                className="rounded-lg spark-cta-gradient px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
              >
                {lines.length ? "Ask again" : "Ask"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
