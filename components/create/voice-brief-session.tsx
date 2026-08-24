"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Mic, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

const OPENING_LINE = "What are we making? Tell me the area and what it's about.";

/** Browser speech splits the name as often as not, so all three spellings count. */
const WAKE_WORD = /(^|\b)spark\s?reels?(\b|$)/i;

export interface BriefSlots {
  city: string | null;
  state: string | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  length: "standard" | "long" | null;
  platform: "reel" | "youtube" | null;
}

const EMPTY_SLOTS: BriefSlots = {
  city: null, state: null, topic: null, audience: null, tone: null, length: null, platform: null,
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
  // What is in the box. Speech fills it, and it stays editable afterwards so a
  // misheard word can be fixed by hand instead of by saying the whole thing
  // again — "Ambler" coming back as "Amber" should cost one keystroke.
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
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
    // Speech lands in the box rather than being sent straight off, so what was
    // heard can be read and corrected before it counts. The exception is the
    // wake word: saying it is an explicit "go", and stopping to ask someone to
    // confirm what they just confirmed would undo the hands-free path.
    onSessionEnd: (text) => {
      setDraft(text);
      if (WAKE_WORD.test(text)) send(text);
    },
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
  const lastUser = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  const live = [transcript, interim].filter(Boolean).join(" ");

  // One box for both ways in: the live transcript while the mic is on, your own
  // editable text once it is off. Speech fills it, typing corrects it, and a
  // misheard town costs a keystroke rather than saying the whole brief again.
  const boxValue = listening ? live : draft;

  function submitDraft() {
    const text = draft.trim();
    if (!text || thinking || disabled) return;
    // Goes as another turn. The session re-reads the whole conversation each
    // time, so a corrected sentence overrides what it heard before — the same
    // mechanism that makes "actually, make it sellers" work.
    send(text);
    setDraft("");
  }

  // Everything the script actually needs. Until these are in, saying the wake
  // word would start a render of a brief with no place or no subject.
  const briefReady = !!(slots.topic && slots.city && slots.state);

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

  // The reply sits under what you said, rather than replacing it.
  const secondLine = listening
    ? (live ? "" : "Listening…")
    : thinking ? "" : summary || lastAssistant;

  return (
    <div className="flex flex-col gap-2">
      {/* The box. Speech writes into it, typing edits it, and Send commits —
          one field for both ways in rather than a transcript you can only read
          next to a separate place to type. */}
      <textarea
        ref={boxRef}
        value={boxValue}
        onChange={(e) => setDraft(e.target.value)}
        // Locked only while the mic is running, where the recogniser owns the
        // value and a keystroke would be overwritten on the next result.
        readOnly={listening}
        disabled={disabled}
        rows={2}
        placeholder="Type what you want, or hit the mic and just say it…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitDraft();
          }
        }}
        className="w-full resize-none rounded-[12px] border border-spark-rule bg-white px-3.5 py-3 text-[16px] leading-[1.5] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber disabled:opacity-60"
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled || thinking}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording" : "Speak"}
          className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-spark-amber transition-colors hover:bg-spark-blue disabled:cursor-not-allowed disabled:opacity-50"
        >
          {listening && (
            <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/30" />
          )}
          <Mic size={18} className="relative text-white" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-spark-ink">{status}</p>
          {secondLine && (
            <p className="mt-0.5 text-[12px] leading-[1.45] text-spark-ink-muted">
              {secondLine}
            </p>
          )}
        </div>

        {/* Full back-and-forth, off by default. The box above already shows
            what matters — what was captured — so the turn-by-turn transcript
            is a "show more", not something that should cost space by default. */}
        {turns.length > 1 && (
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex flex-none items-center gap-1 text-[12px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Conversation
            {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

        <button
          type="button"
          onClick={submitDraft}
          disabled={!draft.trim() || thinking || disabled || listening}
          className="flex-none rounded-full bg-spark-blue px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-spark-blue-deep disabled:cursor-not-allowed disabled:bg-spark-rule-dim"
        >
          Send
        </button>
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

      {/* The wake word, said only once saying it would do something.
          It used to sit here permanently, from the moment the page loaded --
          so the first thing you were told was how to fire a render of a brief
          that had no town and no subject yet. Now it appears when the brief is
          actually complete, and says what it will do. */}
      {briefReady && !listening && !thinking && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-spark-blue/25 bg-spark-blue/10 px-3.5 py-2.5 text-[13px] text-spark-ink">
          <CheckCircle size={14} className="flex-none text-spark-blue" />
          <span className="font-medium">That&rsquo;s everything I need.</span>
          <span className="text-spark-ink-muted">
            Say{" "}
            <span className="rounded-nav bg-[#F7ECD9] px-1.5 py-0.5 font-semibold text-spark-amber">
              SparkReels
            </span>{" "}
            to write the script, or keep talking to change something.
          </span>
        </div>
      )}
    </div>
  );
}
