"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

type Line = { id: string; who: "you" | "sparklee"; text: string };
type Status = "idle" | "connecting" | "live" | "error";

export function AskSparklee({ dark = false }: { dark?: boolean }) {
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
  const [note, setNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps
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

  async function start() {
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
      pc.ontrack = (ev) => { audio.srcObject = ev.streams[0]; };
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
      const max = Number(pass.maxSeconds) || 180;
      setLeft(max);
      timerRef.current = setInterval(() => {
        const remaining = max - Math.floor((Date.now() - startedRef.current) / 1000);
        setLeft(remaining);
        if (remaining <= 0) { setNote("Three minutes is the limit for one conversation."); end("idle"); }
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

  return (
    <>
      <button
        type="button"
        onClick={() => (live || status === "connecting" ? end() : start())}
        aria-label={live ? "Stop Ask Sparklee" : "Ask Sparklee"}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
          live
            ? "bg-red-600 text-white hover:bg-red-700"
            : dark
              ? "bg-white/10 text-spark-paper hover:bg-white/20"
              : "bg-spark-amber-tint text-[#7a4b0a] hover:bg-[#f1dfc0]",
        )}
      >
        {status === "connecting" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        <span className="hidden sm:inline">{live ? "Stop" : "Ask Sparklee"}</span>
        <span className="sm:hidden">{live ? "Stop" : "Ask"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ask Sparklee"
          // Top right, just under the bar (2026-10-14). At the bottom it sat
          // behind Create's footer, which hid half the words and the Stop.
          className="fixed right-4 top-[56px] z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-spark-rule bg-white shadow-xl"
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
