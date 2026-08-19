"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

// iOS Safari sometimes hangs without ever firing onend/onerror, so every
// session gets a hard stop. Longer than FieldMic's 12s — this is a whole
// sentence being dictated, not a two-word city name.
const TIMEOUT_MS = 30000;

// Resting heights, straight from the design's 18-bar waveform. The bars keep
// these heights when idle and get scaled by the `wave` animation while live.
const BAR_HEIGHTS = [9, 17, 26, 14, 31, 22, 34, 12, 27, 19, 30, 11, 24, 16, 28, 13, 20, 9];

interface VoiceTopicHeroProps {
  value: string;
  onChange: (text: string) => void;
  /** Enter in the typed field. */
  onSubmit?: () => void;
  /**
   * Fired once a recording session ends having captured something. This is the
   * "got it" beat — the page uses it to move on, which is why it can't just
   * watch `value`: that fills word by word while the user is still talking.
   */
  onCaptured?: () => void;
  /** Jumps to the template browser below. */
  onBrowseTemplates?: () => void;
  /** How many templates the browser holds — the design writes the count into the link. */
  templateCount?: number;
  disabled?: boolean;
}

export function VoiceTopicHero({
  value,
  onChange,
  onSubmit,
  onCaptured,
  onBrowseTemplates,
  templateCount = 30,
  disabled = false,
}: VoiceTopicHeroProps) {
  const [listening, setListening] = useState(false);
  // Uncommitted words from the recogniser, shown greyed after the real text
  const [interim, setInterim] = useState("");
  const [typing, setTyping] = useState(false);

  const recognitionRef = useRef<AnyRecognition>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // What `value` was when the session started, so each result appends to the
  // sentence so far rather than replacing it.
  const baseRef = useRef("");
  const gotResultRef = useRef(false);
  // Held in a ref so `stop` can stay dependency-free and still call the
  // latest handler rather than the one from the render that started the session.
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;

  const stop = useCallback((showHint = false) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    if (showHint) toast("No speech detected — tap the mic and try again.", { icon: "🎙️" });
  }, []);

  const start = useCallback(() => {
    if (disabled || recognitionRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      setTyping(true);
      return;
    }

    const recognition = new SR() as AnyRecognition;
    recognition.lang = "en-US";
    // Unlike FieldMic, the hero shows the sentence building as it is spoken —
    // that needs interim results and a continuous session.
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    baseRef.current = value.trim();
    gotResultRef.current = false;

    recognition.onresult = (e: {
      resultIndex: number;
      results: { length: number; [k: number]: { isFinal: boolean; [k: number]: { transcript: string } } };
    }) => {
      let settled = "";
      let pending = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else pending += result[0].transcript;
      }
      if (settled.trim()) {
        gotResultRef.current = true;
        onChange([baseRef.current, settled.trim()].filter(Boolean).join(" "));
      }
      setInterim(pending.trim());
    };

    recognition.onend = () => {
      const captured = gotResultRef.current;
      stop(/* showHint= */ !captured);
      if (captured) onCapturedRef.current?.();
    };

    recognition.onerror = (e: { error: string }) => {
      // `aborted` is what fires when we stop the session ourselves — not a fault
      if (e.error === "aborted") return;
      const msg =
        e.error === "not-allowed" ? "Microphone access denied. Please allow mic access and try again." :
        e.error === "network"     ? "Network error during speech recognition. Check your connection." :
        e.error === "no-speech"   ? "No speech detected — tap the mic and try again." :
        "Speech recognition failed. Try again.";
      toast.error(msg);
      stop();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    timeoutRef.current = setTimeout(() => stop(!gotResultRef.current), TIMEOUT_MS);
  }, [disabled, onChange, stop, value]);

  function toggle() {
    if (listening) stop();
    else start();
  }

  // Hold-to-talk. Space is only a shortcut when the user isn't typing into
  // something, or it would swallow every space in the sentence they're writing.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target) || disabled) return;
      e.preventDefault();
      start();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (recognitionRef.current) stop();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [start, stop, disabled]);

  // Never leave a recogniser running behind an unmounted component
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  const hasText = !!(value.trim() || interim);
  const status = listening
    ? "Listening… hold Space or click to stop"
    : hasText
      ? "Tap the mic to add more, or edit it below"
      : "Tap the mic, or hold Space, and speak your topic";

  return (
    <div className="spark-glass flex flex-col items-center gap-4 rounded-[14px] px-6 py-7 sm:px-[34px] sm:pb-[26px] sm:pt-[30px]">
      <p className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-spark-amber">
        <span className="block h-1 w-1 rounded-full bg-spark-amber" />
        Speak your topic
      </p>

      <h2 className="text-balance text-center text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-spark-ink">
        What&rsquo;s this video about?
      </h2>

      {/* Mic. The rings only animate while live — a permanently pulsing button
          reads as a decoration rather than as recording state. */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Stop recording" : "Record your topic"}
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
          {/* The design's mic is a plain rounded capsule, not a lucide glyph */}
          <span className="block h-[26px] w-[15px] rounded-full bg-white" />
        </span>
      </button>

      <p className="text-center text-[13.5px] font-medium text-spark-ink-muted">{status}</p>

      <div className="flex h-[34px] items-center gap-[3px]" aria-hidden="true">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${
              listening ? "animate-wave bg-spark-amber" : "bg-spark-rule"
            }`}
            style={{
              height: `${h}px`,
              // Staggering the delay is what makes the row read as a waveform
              // rather than eighteen bars breathing in unison.
              animationDelay: listening ? `${(i % 6) * 110}ms` : undefined,
            }}
          />
        ))}
      </div>

      {/* Transcript. Committed words in ink, the recogniser's uncommitted tail
          greyed behind them — the same two-tone treatment as the design. */}
      {(hasText || listening) && (
        <div className="spark-surface w-full max-w-[620px] rounded-[10px] border border-spark-rule px-4 py-[13px] text-left text-[17px] leading-[1.5] text-spark-ink">
          {value.trim()}
          {interim && <span className="text-spark-ink-faint">{value.trim() ? " " : ""}{interim}</span>}
          {!hasText && <span className="text-spark-ink-faint">Listening…</span>}
        </div>
      )}

      {typing && (
        <input
          ref={inputRef}
          id="topic-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled) onSubmit?.();
          }}
          placeholder="e.g. Why buyers have more leverage this fall"
          className="w-full max-w-[620px] rounded-[10px] border border-spark-rule bg-white px-4 py-[13px] text-[17px] leading-[1.5] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber"
        />
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-[13px] text-spark-ink-faint">
        <span>or</span>
        <button
          type="button"
          onClick={() => setTyping((t) => !t)}
          className="text-spark-amber underline hover:text-spark-blue"
        >
          {typing ? "hide the text box" : "type it instead"}
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={onBrowseTemplates}
          className="text-spark-amber underline hover:text-spark-blue"
        >
          browse {templateCount} topic templates
        </button>
      </div>
    </div>
  );
}
