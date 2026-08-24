"use client";

import { useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

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
  /**
   * Whether the typed box is showing. Controlled by the page, because the
   * speak-or-type choice now lives at the top of it rather than under the mic.
   */
  typed?: boolean;
  onTypedChange?: (typed: boolean) => void;
  /**
   * Example briefs, cycled through the placeholder while the field is empty
   * and unfocused. Typing mode's answer to the Try line that speak mode shows
   * above the card — this is where someone typing is actually looking.
   */
  placeholderExamples?: string[];
}

export function VoiceTopicHero({
  value,
  onChange,
  onSubmit,
  onCaptured,
  onBrowseTemplates,
  templateCount = 30,
  disabled = false,
  typed,
  onTypedChange,
  placeholderExamples = [],
}: VoiceTopicHeroProps) {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  // Falls back to internal state when the page does not control it.
  const [typingLocal, setTypingLocal] = useState(false);
  const typing = typed ?? typingLocal;
  const setTyping = (next: boolean) => {
    setTypingLocal(next);
    onTypedChange?.(next);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  // What `value` was when the session started, so speech appends to the
  // sentence so far rather than replacing it.
  const baseRef = useRef("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;

  // The recogniser lives in a shared hook — the session component needs the
  // same one, and two copies of something with this many edge cases (the iOS
  // hang, `aborted` not being a real error, re-entrant stop) would drift.
  const { listening, interim, transcript, start, stop } = useSpeechRecognition({
    disabled,
    holdSpace: true,
    onUnsupported: () => setTyping(true),
    onSessionEnd: (finalText) => {
      if (!finalText) return;
      onChangeRef.current([baseRef.current, finalText].filter(Boolean).join(" "));
      onCapturedRef.current?.();
    },
  });

  // Push settled words up as they land, so the topic fills while talking
  // rather than all at once when the session ends.
  useEffect(() => {
    if (!listening || !transcript) return;
    onChangeRef.current([baseRef.current, transcript].filter(Boolean).join(" "));
  }, [listening, transcript]);

  function toggle() {
    if (listening) {
      stop();
      return;
    }
    baseRef.current = value.trim();
    start();
  }

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  // Only while the field is empty and nobody is in it. Text changing under a
  // caret while someone pauses to think is unsettling, and once there is a
  // value the placeholder is not rendered anyway.
  const rotating = typing && !focused && !value && placeholderExamples.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setExampleIdx((i) => i + 1), 3600);
    return () => clearInterval(id);
  }, [rotating]);

  const hasText = !!(value.trim() || interim);
  const status = listening
    ? "Listening… hold Space or click to stop"
    : hasText
      ? "Tap the mic to add more, or edit it below"
      : "Tap the mic, or hold Space, and speak your topic";

  // Typed mode sits as one row inside the page's shared "Your topic" section
  // now, alongside trending and templates — it does not need its own card,
  // eyebrow or question heading; the section header above already says what
  // this is. The speak-mode branch below is currently unreachable (the page
  // always renders VoiceBriefSession for speaking instead) but is left as it
  // was rather than restyled blind.
  return (
    <div
      className={
        typing
          ? "flex flex-col gap-2.5"
          : "spark-glass flex flex-col items-center gap-4 rounded-[14px] px-6 py-7 sm:px-[34px] sm:pb-[26px] sm:pt-[30px]"
      }
    >
      {!typing && (
        <>
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-spark-amber">
            <span className="block h-1 w-1 rounded-full bg-spark-amber" />
            Speak your topic
          </p>

          <h2 className="text-balance text-center text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-spark-ink">
            What&rsquo;s this video about?
          </h2>
        </>
      )}

      {/* Mic, status and waveform belong to speak mode. In type mode they are
          gone entirely rather than shrunk — leaving a 92px mic above a text box
          tells whoever chose "type it" that they picked the wrong one. */}
      {!typing && (
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
      )}

      {!typing && (
        <p className="text-center text-[13.5px] font-medium text-spark-ink-muted">{status}</p>
      )}

      {!typing && (
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
      )}

      {/* Transcript. Committed words in ink, the recogniser's uncommitted tail
          greyed behind them — the same two-tone treatment as the design. */}
      {!typing && (hasText || listening) && (
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            placeholderExamples.length
              ? placeholderExamples[exampleIdx % placeholderExamples.length]
              : "Type what you want, or hit the mic and just say it…"
          }
          // No max-w here: as a centered card it needed one to keep the line
          // readable, but as a row inside the section it should fill the
          // width the section already has, not strand space on either side.
          className="w-full rounded-[10px] border border-spark-rule bg-white px-4 py-[13px] text-[17px] leading-[1.5] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber"
        />
      )}

      <div
        className={`flex flex-wrap items-center gap-3 text-[13px] text-spark-ink-faint ${
          typing ? "justify-start" : "justify-center"
        }`}
      >
        <span>or</span>
        <button
          type="button"
          onClick={() => setTyping(!typing)}
          className="text-spark-amber underline hover:text-spark-blue"
        >
          {/* Switching here moves the choice at the top of the page too — it is
              one setting, reachable from either end. */}
          {typing ? "speak it instead" : "type it instead"}
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
