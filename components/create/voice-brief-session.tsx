"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

/** Resting heights, from the design's 18-bar waveform. */
const BAR_HEIGHTS = [9, 17, 26, 14, 31, 22, 34, 12, 27, 19, 30, 11, 24, 16, 28, 13, 20, 9];

const OPENING_LINE = "What are we making? Tell me the area and what it's about.";

export interface BriefSlots {
  city: string | null;
  state: string | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  length: "standard" | "long" | null;
}

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
 * The spoken brief — design 3b.
 *
 * Deliberately has no "Captured so far" column, which the mock drew down the
 * right-hand side. The slots this fills are the Create page's own fields, and
 * they are already on screen: the market box and the settings chips update as
 * you talk. A second view of the same brief would be two things to keep in
 * agreement for no gain.
 */
export function VoiceBriefSession({ onSlots, onReady, onSwitchToTyping, disabled = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", content: OPENING_LINE }]);
  const [thinking, setThinking] = useState(false);
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

  // Keep the newest exchange in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant")?.content ?? "";
  const live = [transcript, interim].filter(Boolean).join(" ");
  const status = thinking
    ? "Thinking…"
    : listening
      ? "Listening… hold Space or click to stop"
      : "Tap the mic, or hold Space, and answer";

  return (
    <div className="spark-glass flex flex-col items-center gap-4 rounded-[14px] px-6 py-7 sm:px-[34px] sm:pb-[26px] sm:pt-[30px]">
      <p className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-spark-amber">
        <span className="block h-1 w-1 rounded-full bg-spark-amber" />
        Voice session
      </p>

      {/* The current question is the heading — it is the thing being answered. */}
      <h2 className="text-balance text-center text-[24px] font-bold leading-[1.3] tracking-[-0.02em] text-spark-ink sm:text-[26px]">
        {lastAssistant}
      </h2>

      {/* Everything said so far, oldest first. Only rendered once there is a
          real exchange — an empty box under the opening line is just furniture. */}
      {turns.length > 1 && (
        <div
          ref={scrollRef}
          className="spark-surface max-h-[168px] w-full max-w-[620px] overflow-y-auto rounded-[10px] border border-spark-rule px-4 py-3"
        >
          <div className="flex flex-col gap-2">
            {turns.slice(0, -1).map((t, i) => (
              <p
                key={i}
                className={`text-[14px] leading-[1.5] ${
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

      <button
        type="button"
        onClick={toggle}
        disabled={disabled || thinking}
        aria-pressed={listening}
        aria-label={listening ? "Stop recording" : "Answer"}
        className="relative my-0.5 flex h-[92px] w-[92px] items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {listening && (
          <>
            <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/20" />
            <span
              className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/20"
              style={{ animationDelay: "1.1s" }}
            />
          </>
        )}
        <span className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-gradient-to-b from-spark-amber-glow to-spark-amber shadow-mic transition-transform hover:scale-[1.03] active:scale-100">
          <span className="block h-[26px] w-[15px] rounded-full bg-white" />
        </span>
      </button>

      <p className="text-center text-[13.5px] font-medium text-spark-ink-muted">{status}</p>

      <div className="flex h-[34px] items-center gap-[3px]" aria-hidden="true">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${listening ? "animate-wave bg-spark-amber" : "bg-spark-rule"}`}
            style={{
              height: `${h}px`,
              animationDelay: listening ? `${(i % 6) * 110}ms` : undefined,
            }}
          />
        ))}
      </div>

      {/* What is being said right now, before it becomes a turn. */}
      {(live || listening) && (
        <div className="spark-surface w-full max-w-[620px] rounded-[10px] border border-spark-rule px-4 py-[13px] text-left text-[17px] leading-[1.5] text-spark-ink">
          {transcript}
          {interim && <span className="text-spark-ink-faint">{transcript ? " " : ""}{interim}</span>}
          {!live && <span className="text-spark-ink-faint">Listening…</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-[13px] text-spark-ink-faint">
        <span>Say</span>
        <span className="rounded-nav bg-[#F7ECD9] px-2 py-0.5 font-medium text-spark-amber">
          SparkReels
        </span>
        <span>when you&rsquo;re happy with it · or</span>
        <button
          type="button"
          onClick={onSwitchToTyping}
          className="text-spark-amber underline hover:text-spark-blue"
        >
          type it instead
        </button>
      </div>
    </div>
  );
}
