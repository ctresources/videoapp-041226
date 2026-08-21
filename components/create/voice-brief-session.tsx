"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Mic, ChevronDown, ChevronUp } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

const OPENING_LINE = "What are we making? Tell me the area and what it's about.";

export interface BriefSlots {
  city: string | null;
  state: string | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  length: "standard" | "long" | null;
}

const EMPTY_SLOTS: BriefSlots = {
  city: null, state: null, topic: null, audience: null, tone: null, length: null,
};

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  /** Applies whatever the conversation has established. */
  onSlots: (slots: BriefSlots) => void;
  /**
   * The agent said the wake word and the brief is complete.
   *
   * Receives the slots directly. onSlots and onReady fire in the same tick, so
   * anything onReady read back from React state would be a render behind — and
   * one utterance carrying the whole brief plus the wake word is exactly the
   * case where that state is still empty.
   */
  onReady: (slots: BriefSlots) => void;
  /** Escape hatch — hands over to the typed form. */
  onSwitchToTyping: () => void;
  disabled?: boolean;
}

/**
 * The spoken brief — design 3b, restyled compact.
 *
 * Originally a tall standalone card: its own shaded panel, a 92px mic, an
 * 18-bar waveform, and the current question set as a page-sized heading. That
 * made sense when it was the only way in, but it now sits as one row inside
 * the page's "Your topic" section, next to trending and templates — other
 * paths to the same field — and looking like a separate destination fought
 * that. Modelled on the editor's compact voice row (36px mic, two lines of
 * text) rather than its own previous design.
 *
 * No "Captured so far" column, which the mock drew down the right-hand side.
 * The slots this fills are the Create page's own fields, already on screen —
 * a second view of the same brief would be two things to keep in agreement.
 * A short summary line here is not that: it is a glance at what voice itself
 * has captured this conversation, not a duplicate of the form.
 */
export function VoiceBriefSession({ onSlots, onReady, onSwitchToTyping, disabled = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", content: OPENING_LINE }]);
  const [thinking, setThinking] = useState(false);
  const [slots, setSlots] = useState<BriefSlots>(EMPTY_SLOTS);
  const [showTranscript, setShowTranscript] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guards against a second submit while a turn is in flight, without waiting
  // for the `thinking` state to land.
  const busyRef = useRef(false);

  // `send` reads the transcript through a ref so it never closes over a stale
  // turn list — the recogniser's callback outlives the render that made it.
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const send = useCallback(async (spoken: string) => {
    const said = spoken.trim();
    if (!said || busyRef.current) return;
    busyRef.current = true;

    const next: Turn[] = [...turnsRef.current, { role: "user", content: said }];
    setTurns(next);
    setThinking(true);
    try {
      const res = await fetch("/api/ai/brief-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 503 means the brief model is unavailable. Stranding someone mid
        // sentence with a mic that will not answer is worse than handing them
        // the form they can always fall back to.
        if (res.status === 503) {
          toast.error("The voice session isn't available right now — switched you to typing.");
          onSwitchToTyping();
          return;
        }
        throw new Error((data.error as string) || `Brief failed (${res.status})`);
      }

      onSlots(data.slots as BriefSlots);
      setSlots(data.slots as BriefSlots);
      setTurns((t) => [...t, { role: "assistant", content: data.reply as string }]);
      if (data.ready === true) onReady(data.slots as BriefSlots);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't follow that — try again.");
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "Sorry — I didn't catch that. Say it again?" },
      ]);
    } finally {
      setThinking(false);
      busyRef.current = false;
    }
  }, [onSlots, onReady, onSwitchToTyping]);

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    onSessionEnd: send,
    onUnsupported: onSwitchToTyping,
    disabled: disabled || thinking,
    holdSpace: true,
  });

  // Keep the newest exchange in view as the conversation grows, but only while
  // the transcript is actually open — no point animating a scroll no one sees.
  useEffect(() => {
    if (!showTranscript) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking, showTranscript]);

  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant")?.content ?? "";
  const live = [transcript, interim].filter(Boolean).join(" ");

  // What voice has captured so far, condensed to one line — the compact
  // stand-in for the big centered heading the old design used.
  const summary = [
    slots.city && slots.state ? `${slots.city}, ${slots.state}` : slots.city,
    slots.topic,
    slots.audience,
    slots.length === "long" ? "long length" : slots.length === "standard" ? "standard length" : null,
  ].filter(Boolean).join(" · ");

  const status = thinking
    ? "Thinking…"
    : listening
      // Space is push-to-talk — release it (not hold it) to stop.
      ? "Listening — click the mic, or release Spacebar, to stop"
      : "Click the mic, or hold Spacebar, and answer";

  const secondLine = listening ? (live || "Listening…") : summary || lastAssistant;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled || thinking}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording" : "Answer"}
          className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-spark-amber transition-colors hover:bg-spark-blue disabled:cursor-not-allowed disabled:opacity-50"
        >
          {listening && (
            <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/30" />
          )}
          <Mic size={16} className="relative text-white" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-spark-ink">{status}</p>
          <p className="mt-0.5 truncate text-[12px] leading-[1.45] text-spark-ink-muted">
            {secondLine}
          </p>
        </div>

        {/* Full back-and-forth, off by default. The compact row above already
            shows what matters — what was captured — so the turn-by-turn
            transcript is a "show more", not something that should cost space
            by default. */}
        {turns.length > 1 && (
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex flex-none items-center gap-1 self-center text-[12px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Conversation
            {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {showTranscript && turns.length > 1 && (
        <div
          ref={scrollRef}
          className="spark-surface max-h-[140px] overflow-y-auto rounded-[9px] border border-spark-rule px-3.5 py-2.5"
        >
          <div className="flex flex-col gap-1.5">
            {turns.map((t, i) => (
              <p
                key={i}
                className={`text-[13px] leading-[1.5] ${
                  t.role === "user" ? "text-spark-ink" : "text-spark-ink-faint"
                }`}
              >
                {t.role === "user" ? "" : "— "}
                {t.content}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-spark-ink-faint">
        <span>Say</span>
        <span className="rounded-nav bg-[#F7ECD9] px-1.5 py-0.5 font-medium text-spark-amber">
          SparkReels
        </span>
        <span>to make it</span>
      </p>
    </div>
  );
}
